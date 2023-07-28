use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use axum::middleware;
use axum::routing::post;
use axum::Router;
use axum_sessions::async_session::CookieStore;
use axum_sessions::SessionLayer;
use clap::Parser;
use concordium_rust_sdk::cis4::Cis4Contract;
use concordium_rust_sdk::common::types::KeyPair;
use concordium_rust_sdk::types::{
    ContractAddress, CryptographicParameters, Energy, Nonce, WalletAccount,
};
use concordium_rust_sdk::v2::{self, BlockIdentifier};
use rand::Rng;
use reqwest::Url;
use tonic::transport::ClientTlsConfig;
use tower_http::services::ServeDir;

mod discord;
mod issuer;
mod telegram;

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "SOME_ISSUER_NODE"
    )]
    endpoint: v2::Endpoint,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "SOME_ISSUER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "SOME_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "SOME_ISSUER_REGISTRY_ADDRESS"
    )]
    registry: ContractAddress,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "SOME_ISSUER_WALLET"
    )]
    wallet: PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "SOME_ISSUER_KEY"
    )]
    issuer_key: PathBuf,
    #[clap(
        long = "max-register-energy",
        help = "The amount of energy to allow for execution of the register credential \
                transaction. This must be less than max block energy of the chain the service is \
                connected to.",
        default_value = "10000",
        env = "SOME_ISSUER_MAX_REGISTER_ENERGY"
    )]
    max_register_energy: Energy,
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
        long = "port",
        default_value = "80",
        help = "Port for the issuer dApp.",
        env = "SOME_ISSUER_PORT"
    )]
    port: u16,
    #[clap(
        long = "dapp-url",
        default_value = "http://127.0.0.1/",
        help = "URL of the issuer dApp.",
        env = "SOME_ISSUER_DAPP_URL"
    )]
    dapp_url: Url,
}

#[derive(Clone)]
pub struct AppState {
    crypto_params: Arc<CryptographicParameters>,
    contract_client: Cis4Contract,
    issuer: Arc<WalletAccount>,
    issuer_key: Arc<KeyPair>,
    nonce_counter: Arc<tokio::sync::Mutex<Nonce>>,
    max_register_energy: Energy,
    http_client: reqwest::Client,
    discord_client_id: Arc<String>,
    discord_client_secret: Arc<String>,
    telegram_bot_token: Arc<String>,
    dapp_url: Arc<Url>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(app.log_level)
            .init();
    }

    let endpoint = if app
        .endpoint
        .uri()
        .scheme()
        .map_or(false, |x| x == &http::uri::Scheme::HTTPS)
    {
        app.endpoint
            .tls_config(ClientTlsConfig::new())
            .context("Unable to construct TLS configuration for Concordium API.")?
    } else {
        app.endpoint
    }
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_millis(app.request_timeout));

    tracing::info!("Connecting to node...");

    let mut node_client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let issuer_key = serde_json::from_reader(&std::fs::File::open(&app.issuer_key)?)
        .context("Unable to read issuer's key.")?;
    let issuer = Arc::new(WalletAccount::from_json_file(app.wallet)?);

    let nonce = node_client
        .get_next_account_sequence_number(&issuer.address)
        .await?;
    anyhow::ensure!(
        nonce.all_final,
        "Not all transactions are finalized. Refusing to start."
    );

    tracing::info!(
        "Using account {} starting at nonce {}.",
        issuer.address,
        nonce.nonce
    );

    let crypto_params = node_client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await?
        .response;

    let contract_client = Cis4Contract::create(node_client, app.registry).await?;

    let http_client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_millis(app.request_timeout))
        .build()
        .context("Unable to initialize HTTP client.")?;

    let state = AppState {
        crypto_params: Arc::new(crypto_params),
        contract_client,
        issuer,
        issuer_key: Arc::new(issuer_key),
        nonce_counter: Arc::new(tokio::sync::Mutex::new(nonce.nonce)),
        max_register_energy: app.max_register_energy,
        http_client,
        discord_client_id: Arc::new(app.discord_client_id),
        discord_client_secret: Arc::new(app.discord_client_secret),
        telegram_bot_token: Arc::new(app.telegram_bot_token),
        dapp_url: Arc::new(app.dapp_url),
    };

    let session_store = CookieStore::new();
    let mut session_secret = [0u8; 128];
    rand::thread_rng().fill(&mut session_secret);
    let session_layer = SessionLayer::new(session_store, &session_secret)
        .with_persistence_policy(axum_sessions::PersistencePolicy::ChangedOnly);

    let frontend_service = ServeDir::new("frontend/dist");
    let json_schema_service = ServeDir::new("json-schemas");
    let discord_oauth_middleware =
        middleware::from_fn_with_state(state.clone(), discord::handle_oauth);
    let router = Router::new()
        .nest_service("/", frontend_service)
        // Extract OAuth2 code from query parameters for Discord authentication
        .route_layer(discord_oauth_middleware)
        .route("/credential", post(issuer::issue_credential))
        .layer(session_layer)
        .nest_service("/json-schemas", json_schema_service)
        .with_state(state);

    tracing::info!("Starting server...");

    axum::Server::bind(&format!("0.0.0.0:{}", app.port).parse().unwrap())
        .serve(router.into_make_service())
        .await
        .context("Unable to start server.")
}
