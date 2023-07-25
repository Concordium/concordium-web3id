use std::sync::Arc;

use axum::middleware;
use axum::routing::post;
use axum::Router;
use clap::Parser;
use reqwest::Client;
use reqwest::Url;
use tower_http::services::ServeDir;

mod discord;
mod telegram;

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "discord-client-id",
        help = "Discord client ID for OAuth2.",
        env = "DISCORD_CLIENT_ID"
    )]
    discord_client_id: String,
    #[clap(
        long = "discord-client-secret",
        help = "Discord client secret for OAuth2.",
        env = "DISCORD_CLIENT_SECRET"
    )]
    discord_client_secret: String,
    #[clap(
        long = "telegram-token",
        help = "Bot token for Telegram.",
        env = "TELEGRAM_BOT_TOKEN"
    )]
    telegram_bot_token: String,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "SOME_ISSUER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "port",
        default_value = "80",
        help = "Port for the dApp.",
        env = "SOME_ISSUER_DAPP_PORT"
    )]
    dapp_port: u16,
    #[clap(
        long = "dapp-url",
        default_value = "http://127.0.0.1/",
        help = "URL of the verification dapp.",
        env = "SOME_ISSUER_DAPP_URL"
    )]
    dapp_url: Url,
}

#[derive(Clone)]
pub struct AppState {
    client: Client,
    discord_client_id: Arc<String>,
    discord_client_secret: Arc<String>,
    telegram_bot_token: Arc<String>,
    dapp_url: Arc<Url>,
}

#[tokio::main]
async fn main() {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(app.log_level)
            .init();
    }

    let state = AppState {
        client: Client::new(),
        discord_client_id: Arc::new(app.discord_client_id),
        discord_client_secret: Arc::new(app.discord_client_secret),
        telegram_bot_token: Arc::new(app.telegram_bot_token),
        dapp_url: Arc::new(app.dapp_url),
    };

    let serve_dir_service = ServeDir::new("frontend/dist");
    let router = Router::new()
        .nest_service("/", serve_dir_service)
        // Extract OAuth2 code from query parameters for Discord authentication
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            discord::handle_oauth,
        ))
        // Handle telegram authenticaiton
        .route("/telegram", post(telegram::handle_auth))
        .with_state(state);

    axum::Server::bind(&format!("0.0.0.0:{}", app.dapp_port).parse().unwrap())
        .serve(router.into_make_service())
        .await
        .unwrap();
}
