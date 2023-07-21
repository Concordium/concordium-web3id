use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use anyhow::anyhow;
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use clap::Parser;
use futures::{future, TryFutureExt};
use rust_tdlib::client::tdlib_client::TdJson;
use rust_tdlib::client::{
    AuthStateHandlerProxy, ClientIdentifier, ConsoleClientStateHandlerIdentified,
};
use rust_tdlib::tdjson;
use rust_tdlib::types::{GetUser, TdlibParameters};
use serde::Deserialize;
use some_verifier_lib::{Platform, Verification};
use tower_http::services::ServeDir;

use crate::db::{Account, Database, DbPlatform, Discord, Telegram};

mod db;

#[derive(clap::Parser, Debug)]
#[clap(version, author)]
struct App {
    #[clap(
        long = "discord-bot-token",
        help = "Discord bot token for looking up usernames.",
        env = "DISCORD_BOT_TOKEN"
    )]
    discord_bot_token: String,
    #[clap(
        long = "telegram-api-id",
        help = "Telegram API ID for looking up usernames.",
        env = "TELEGRAM_API_ID"
    )]
    telegram_api_id: i32,
    #[clap(
        long = "telegram-api-hash",
        help = "Telegram API hash for looking up usernames.",
        env = "TELEGRAM_API_HASH"
    )]
    telegram_api_hash: String,
    #[clap(
        long = "telegram-bot-token",
        help = "Telegram bot token for looking up usernames.",
        env = "TELEGRAM_BOT_TOKEN"
    )]
    telegram_bot_token: String,
    #[clap(
        long = "db",
        default_value = "host=localhost dbname=some-verifier user=postgres password=password port=5432",
        help = "Database connection string.",
        env = "SOME_VERIFIER_DB_STRING"
    )]
    db_config: tokio_postgres::Config,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "SOME_VERIFIER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "port",
        default_value = "8080",
        help = "Port of the SoMe verifier.",
        env = "SOME_VERIFIER_PORT"
    )]
    port: u16,
}

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    tdlib_client: Arc<rust_tdlib::client::Client<TdJson>>,
    discord_bot_token: Arc<String>,
    database: Arc<Database>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        let log_filter =
            tracing_subscriber::filter::Targets::new().with_target(module_path!(), app.log_level);
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
            .init();
    }
    tdjson::set_log_verbosity_level(1);

    tracing::info!("Connecting to database...");
    let database = Database::connect(app.db_config).await?;

    tracing::info!("Starting Telegram client...");
    let tdlib_params = TdlibParameters::builder()
        .database_directory("tddb")
        .use_test_dc(false)
        .api_id(app.telegram_api_id)
        .api_hash(app.telegram_api_hash)
        .system_language_code("en")
        .device_model("Desktop")
        .system_version("Unknown")
        .application_version(env!("CARGO_PKG_VERSION"))
        .enable_storage_optimizer(true)
        .build();

    let tdlib_client = rust_tdlib::client::Client::builder()
        .with_tdlib_parameters(tdlib_params)
        .with_client_auth_state_handler(ConsoleClientStateHandlerIdentified::new(
            ClientIdentifier::BotToken(app.telegram_bot_token),
        ))
        .build()?;

    let mut worker = rust_tdlib::client::Worker::builder()
        .with_auth_state_handler(AuthStateHandlerProxy::new_with_encryption_key("".into()))
        .build()?;
    worker.start();
    let tdlib_client = worker.bind_client(tdlib_client).await?;

    let client = reqwest::Client::new();

    let state = AppState {
        client,
        tdlib_client: Arc::new(tdlib_client),
        discord_bot_token: Arc::new(app.discord_bot_token),
        database: Arc::new(database),
    };

    tracing::info!("Starting server...");
    let serve_dir_service = ServeDir::new("frontend/dist");
    let router = Router::new()
        .nest_service("/", serve_dir_service)
        .route(
            "/verifications/telegram/:id",
            get(handle_get_verifications::<Telegram>),
        )
        .route(
            "/verifications/discord/:id",
            get(handle_get_verifications::<Discord>),
        )
        .with_state(state);

    let socket = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), app.port);
    axum::Server::bind(&socket)
        .serve(router.into_make_service())
        .await?;

    Ok(())
}

async fn handle_get_verifications<P: DbPlatform>(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Json<Vec<Verification>> {
    let accounts = state.database.get_accounts::<P>(id).await;
    match accounts {
        Ok(accounts) => {
            // Futures that simultaneously look up username and revocation status of user
            // The futures are then mapped to Verifications
            let futures = accounts.iter().map(|acc| {
                future::try_join3(
                    async { Ok(acc.platform) },
                    get_username(&state, acc),
                    state
                        .database
                        .get_revocation_status(acc)
                        .map_err(|e| anyhow!(e)),
                )
                .map_ok(|(platform, username, revoked)| Verification {
                    platform,
                    username,
                    revoked,
                })
            });

            // Keep all the non-error values since the others could not get a username
            // or a revocation status for whatever reason, probably because the user
            // is not verified with that platform
            let verifications = future::join_all(futures)
                .await
                .into_iter()
                .filter_map(|res| res.ok())
                .collect();
            Json(verifications)
        }
        Err(_) => Json(vec![]),
    }
}

/// Looks up the username of the given account.
async fn get_username(state: &AppState, account: &Account) -> anyhow::Result<String> {
    #[derive(Deserialize)]
    struct DiscordUser {
        username: String,
        discriminator: String,
    }

    let id = account.id as u64;
    match account.platform {
        // TODO: This is unreliable if the user deletes their chat with the bot
        Platform::Telegram => {
            let user = state
                .tdlib_client
                .get_user(GetUser::builder().user_id(account.id).build())
                .await?;
            let name = if user.username().is_empty() {
                if user.last_name().is_empty() {
                    format!("{}", user.first_name())
                } else {
                    format!("{} {}", user.first_name(), user.last_name())
                }
            } else {
                user.username().clone()
            };
            Ok(name)
        }
        Platform::Discord => {
            const API_ENDPOINT: &'static str = "https://discord.com/api/v10";
            let user = state
                .client
                .get(format!("{API_ENDPOINT}/users/{}", id))
                .header("Authorization", format!("Bot {}", state.discord_bot_token))
                .send()
                .await?
                .json::<DiscordUser>()
                .await?;
            Ok(format!("{}#{}", user.username, user.discriminator))
        }
    }
}
