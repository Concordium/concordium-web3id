use axum::extract::rejection::JsonRejection;
use axum::extract::State;
use concordium_rust_sdk::contract_client::CredentialInfo;
use concordium_rust_sdk::web3id::did::Network;
use hmac::{Hmac, Mac};
use http::{HeaderValue, StatusCode};
use reqwest::Url;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use some_issuer::{issue_credential, IssueResponse, IssuerState};
use std::fmt::{self, Display};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use axum::routing::post;
use axum::{Json, Router};
use clap::Parser;
use concordium_rust_sdk::cis4::Cis4Contract;
use concordium_rust_sdk::types::{ContractAddress, Energy, WalletAccount};
use concordium_rust_sdk::v2::{self, BlockIdentifier};
use tonic::transport::ClientTlsConfig;

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "TELEGRAM_ISSUER_NODE"
    )]
    endpoint: v2::Endpoint,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "TELEGRAM_ISSUER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "TELEGRAM_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "TELEGRAM_ISSUER_REGISTRY_ADDRESS"
    )]
    registry: ContractAddress,
    #[clap(
        long = "network",
        help = "The network of the issuer.",
        default_value = "testnet",
        env = "TELEGRAM_ISSUER_NETWORK"
    )]
    network: Network,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "TELEGRAM_ISSUER_WALLET"
    )]
    wallet: PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "TELEGRAM_ISSUER_KEY"
    )]
    issuer_key: PathBuf,
    #[clap(
        long = "max-register-energy",
        help = "The amount of energy to allow for execution of the register credential \
                transaction. This must be less than max block energy of the chain the service is \
                connected to.",
        default_value = "10000",
        env = "TELEGRAM_ISSUER_MAX_REGISTER_ENERGY"
    )]
    max_register_energy: Energy,
    #[clap(
        long = "telegram-token",
        help = "Bot token for Telegram.",
        env = "TELEGRAM_BOT_TOKEN"
    )]
    telegram_bot_token: String,
    #[clap(
        long = "listen-address",
        help = "Socket addres for the Telegram issuer.",
        default_value = "0.0.0.0:8080",
        env = "TELEGRAM_ISSUER_LISTEN_ADDRESS"
    )]
    listen_address: SocketAddr,
    #[clap(
        long = "url",
        help = "URL of the Telegram issuer.",
        default_value = "http://127.0.0.1:8080/",
        env = "TELEGRAM_ISSUER_URL"
    )]
    url: Url,
    #[clap(
        long = "dapp-domain",
        help = "The domain of the dApp, used for CORS.",
        default_value = "http://127.0.0.1",
        env = "TELEGRAM_ISSUER_DAPP_URL"
    )]
    dapp_domain: String,
}

#[derive(Clone)]
struct AppState {
    issuer: IssuerState,
    telegram_bot_token: Arc<String>,
}

#[derive(Deserialize, Debug)]
struct User {
    id: u64,
    first_name: String,
    last_name: Option<String>,
    username: Option<String>,
    photo_url: Option<String>,
    auth_date: u64,
    hash: String,
}

type HmacSha256 = Hmac<Sha256>;
impl User {
    fn check(&self, telegram_bot_token: &str) -> anyhow::Result<()> {
        let mut hasher = Sha256::new();
        hasher.update(telegram_bot_token);
        let key = hasher.finalize();

        let mut mac = HmacSha256::new_from_slice(&key).unwrap();
        mac.update(self.to_string().as_bytes());

        let mac_bytes = mac.finalize().into_bytes();
        let expected = hex::decode(&self.hash)?;

        anyhow::ensure!(&mac_bytes[..] == &expected[..], "MAC did not match hash.");
        Ok(())
    }
}

/// Note: the exact format of this is important, as it is used for verification.
/// See https://core.telegram.org/widgets/login
impl Display for User {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        writeln!(f, "auth_date={}", self.auth_date)?;
        writeln!(f, "first_name={}", self.first_name)?;
        write!(f, "id={}", self.id)?;
        if let Some(last_name) = &self.last_name {
            write!(f, "\nlast_name={last_name}")?;
        }
        if let Some(photo_url) = &self.photo_url {
            write!(f, "\nphoto_url={photo_url}")?;
        }
        if let Some(username) = &self.username {
            write!(f, "\nusername={username}")?;
        }
        Ok(())
    }
}

/// Request for issuance of Telegram credential.
/// Telegram authentication happens in a single request that includes a user object.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TelegramIssueRequest {
    credential: CredentialInfo,
    telegram_user: User,
}

async fn issue_telegram_credential(
    State(state): State<AppState>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<IssueResponse>, StatusCode> {
    let request = match serde_json::from_value::<TelegramIssueRequest>(request) {
        Ok(req) => req,
        Err(err) => {
            tracing::warn!("Unable to deserialize request: {err}");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    if let Err(err) = request.telegram_user.check(&state.telegram_bot_token) {
        tracing::warn!("Invalid Telegram user in request: {err}");
        return Err(StatusCode::BAD_REQUEST);
    }

    issue_credential(
        state.issuer,
        request.credential,
        request.telegram_user.id.to_string(),
    )
    .await
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
    let issuer_account = WalletAccount::from_json_file(app.wallet)?;

    let nonce = node_client
        .get_next_account_sequence_number(&issuer_account.address)
        .await?;
    anyhow::ensure!(
        nonce.all_final,
        "Not all transactions are finalized. Refusing to start."
    );

    tracing::info!(
        "Using account {} starting at nonce {}.",
        issuer_account.address,
        nonce.nonce
    );

    let crypto_params = node_client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await?
        .response;

    let contract_client = Cis4Contract::create(node_client, app.registry).await?;

    let metadata_url = app.url.join("json-schemas/credential-metadata.json")?;
    let credential_schema_url = app.url.join("json-schemas/JsonSchema2023-discord.json")?;

    let issuer = IssuerState {
        crypto_params: Arc::new(crypto_params),
        contract_client,
        network: app.network,
        issuer: Arc::new(issuer_account),
        issuer_key: Arc::new(issuer_key),
        nonce_counter: Arc::new(tokio::sync::Mutex::new(nonce.nonce)),
        max_register_energy: app.max_register_energy,
        metadata_url: Arc::new(metadata_url),
        credential_schema_url: Arc::new(credential_schema_url),
    };
    let state = AppState {
        issuer,
        telegram_bot_token: Arc::new(app.telegram_bot_token),
    };

    let cors = CorsLayer::new()
        .allow_methods([http::Method::GET, http::Method::POST])
        .allow_origin(
            app.dapp_domain
                .parse::<HeaderValue>()
                .context("dApp domain was not valid.")?,
        )
        .allow_credentials(true)
        .allow_headers([http::header::CONTENT_TYPE]);

    let json_schema_service = ServeDir::new("json-schemas/telegram");
    let router = Router::new()
        .route("/credential", post(issue_telegram_credential))
        .nest_service("/json-schemas", json_schema_service)
        .layer(cors)
        .with_state(state);

    tracing::info!("Starting server on {}...", app.listen_address);

    axum::Server::bind(&app.listen_address)
        .serve(router.into_make_service())
        .await
        .context("Unable to start server.")
}
