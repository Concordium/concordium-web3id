use anyhow::Context;
use axum::{
    extract::State,
    response::Html,
    routing::{get, post},
    Json, Router,
};
use clap::Parser;
use concordium_rust_sdk::{
    cis4::Cis4Contract,
    contract_client::CredentialInfo,
    types::{ContractAddress, Energy, WalletAccount},
    v2::{self, BlockIdentifier},
    web3id::did::Network,
};
use handlebars::Handlebars;
use hmac::{Hmac, Mac};
use http::{HeaderValue, StatusCode};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use some_issuer::{set_shutdown, IssueResponse, IssuerState};
use std::{fmt::Write, fs, net::SocketAddr, path::PathBuf, sync::Arc};
use tonic::transport::ClientTlsConfig;
use tower_http::{cors::CorsLayer, services::ServeDir};

const HTML_TITLE: &str = "Telegram Web3 ID issuer";

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
    endpoint:             v2::Endpoint,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "TELEGRAM_ISSUER_LOG_LEVEL"
    )]
    log_level:            tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "TELEGRAM_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout:      u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "TELEGRAM_ISSUER_REGISTRY_ADDRESS"
    )]
    registry:             ContractAddress,
    #[clap(
        long = "network",
        help = "The network of the issuer.",
        default_value = "testnet",
        env = "TELEGRAM_ISSUER_NETWORK"
    )]
    network:              Network,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "TELEGRAM_ISSUER_WALLET"
    )]
    wallet:               PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "TELEGRAM_ISSUER_KEY"
    )]
    issuer_key:           PathBuf,
    #[clap(
        long = "max-register-energy",
        help = "The amount of energy to allow for execution of the register credential \
                transaction. This must be less than max block energy of the chain the service is \
                connected to.",
        default_value = "10000",
        env = "TELEGRAM_ISSUER_MAX_REGISTER_ENERGY"
    )]
    max_register_energy:  Energy,
    #[clap(
        long = "telegram-token",
        help = "Bot token for Telegram.",
        env = "TELEGRAM_ISSUER_TELEGRAM_BOT_TOKENS",
        use_value_delimiter = true,
        value_delimiter = ','
    )]
    telegram_bot_tokens:  Vec<String>,
    #[clap(
        long = "listen-address",
        help = "Socket address for the Telegram issuer.",
        default_value = "0.0.0.0:80", // To test the frontend, default port (80) is needed when running locally, as otherwise the iframe providing the telegram login button does not work.
        env = "TELEGRAM_ISSUER_LISTEN_ADDRESS"
    )]
    listen_address:       SocketAddr,
    #[clap(
        long = "url",
        help = "URL of the Telegram issuer.",
        default_value = "http://127.0.0.1/",
        env = "TELEGRAM_ISSUER_URL"
    )]
    url:                  Url,
    #[clap(
        long = "verifier-dapp-domain",
        help = "The domain of the verifier dApp, used for CORS.",
        default_value = "http://127.0.0.1",
        env = "TELEGRAM_ISSUER_VERIFIER_DAPP_URL"
    )]
    verifier_dapp_domain: String,
    #[clap(
        long = "telegram-bot-name",
        help = "The name (handle) of the Telegram bot.",
        env = "TELEGRAM_ISSUER_TELEGRAM_BOT_NAME"
    )]
    telegram_bot_name:    String,
    #[clap(
        long = "frontend",
        default_value = "./frontend/dist/telegram",
        help = "Path to the directory where frontend assets are located.",
        env = "TELEGRAM_ISSUER_FRONTEND"
    )]
    frontend_assets:      std::path::PathBuf,
}

#[derive(Clone)]
struct AppState {
    issuer:              IssuerState,
    telegram_bot_tokens: Arc<[String]>,
}

#[derive(Deserialize, Debug)]
struct User {
    id:         u64,
    first_name: String,
    last_name:  Option<String>,
    username:   Option<String>,
    photo_url:  Option<String>,
    auth_date:  u64,
    hash:       String,
}

type HmacSha256 = Hmac<Sha256>;
impl User {
    /// See https://core.telegram.org/widgets/login
    fn data_check_string(&self) -> String {
        let mut buf = String::new();
        writeln!(&mut buf, "auth_date={}", self.auth_date).expect("can write to string");
        writeln!(&mut buf, "first_name={}", self.first_name).expect("can write to string");
        write!(&mut buf, "id={}", self.id).expect("can write to string");
        if let Some(last_name) = &self.last_name {
            write!(&mut buf, "\nlast_name={last_name}").expect("can write to string");
        }
        if let Some(photo_url) = &self.photo_url {
            write!(&mut buf, "\nphoto_url={photo_url}").expect("can write to string");
        }
        if let Some(username) = &self.username {
            write!(&mut buf, "\nusername={username}").expect("can write to string");
        }
        buf
    }

    fn check(&self, telegram_bot_token: &str) -> anyhow::Result<()> {
        let key = Sha256::digest(telegram_bot_token.as_bytes());

        let mut mac = HmacSha256::new_from_slice(&key).expect("key is 32 bytes");
        mac.update(self.data_check_string().as_bytes());

        let mac_bytes = mac.finalize().into_bytes();
        let expected = hex::decode(&self.hash)?;

        anyhow::ensure!(mac_bytes[..] == expected[..], "MAC did not match hash.");
        Ok(())
    }
}

/// Request for issuance of Telegram credential.
/// Telegram authentication happens in a single request that includes a user
/// object.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TelegramIssueRequest {
    credential:    CredentialInfo,
    telegram_user: User,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContractConfig {
    index:    String,
    subindex: String,
}

impl From<ContractAddress> for ContractConfig {
    fn from(value: ContractAddress) -> Self {
        Self {
            index:    value.index.to_string(),
            subindex: value.subindex.to_string(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendConfig {
    #[serde(rename = "type")]
    config_type:       String,
    telegram_bot_name: String,
    network:           Network,
    contract:          ContractConfig,
}

#[tracing::instrument(level = "debug", skip_all, fields(holder_id = %request.credential.holder_id))]
async fn issue_telegram_credential(
    State(state): State<AppState>,
    Json(request): Json<TelegramIssueRequest>,
) -> Result<Json<IssueResponse>, StatusCode> {
    println!("{:?}", &state
        .telegram_bot_tokens);
    if state
        .telegram_bot_tokens
        .iter()
        .all(|token| request.telegram_user.check(token).is_err())
    {
        tracing::warn!("Invalid Telegram user in request.");
        return Err(StatusCode::BAD_REQUEST);
    }

    match request.telegram_user.username {
        None => {
            tracing::warn!("Missing username in telegram user");
            Err(StatusCode::BAD_REQUEST)
        }
        Some(username) => {
            state
                .issuer
                .issue_credential(
                    &request.credential,
                    request.telegram_user.id.to_string(),
                    username,
                )
                .await
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        let log_filter = tracing_subscriber::filter::Targets::new()
            .with_target(module_path!(), app.log_level)
            .with_target("some_issuer", app.log_level)
            .with_target("tower_http", app.log_level);
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
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

    let mut contract_client = Cis4Contract::create(node_client, app.registry).await?;

    let metadata_url = app.url.join("json-schemas/credential-metadata.json")?;

    let registry_metadata = contract_client
        .registry_metadata(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get registry metadata")?;

    let issuer = IssuerState {
        crypto_params: Arc::new(crypto_params),
        contract_client,
        network: app.network,
        issuer: Arc::new(issuer_account),
        issuer_key: Arc::new(issuer_key),
        nonce_counter: Arc::new(tokio::sync::Mutex::new(nonce.nonce)),
        max_register_energy: app.max_register_energy,
        metadata_url: Arc::new(metadata_url),
        credential_type: registry_metadata.credential_type,
        credential_schema_url: registry_metadata.credential_schema.schema_ref.url().into(),
    };
    let state = AppState {
        issuer,
        telegram_bot_tokens: Arc::from(app.telegram_bot_tokens),
    };

    let cors = CorsLayer::new()
        .allow_methods([http::Method::GET, http::Method::POST])
        .allow_origin(
            app.verifier_dapp_domain
                .parse::<HeaderValue>()
                .context("dApp domain was not valid.")?,
        )
        .allow_credentials(true)
        .allow_headers([http::header::CONTENT_TYPE]);
    // Render index.html with config
    let index_template = fs::read_to_string(app.frontend_assets.join("index.html"))
        .context("Frontend was not built.")?;
    let mut reg = Handlebars::new();
    // Prevent handlebars from escaping inserted object
    reg.register_escape_fn(|s| s.into());
    let frontend_config = FrontendConfig {
        config_type:       "telegram".into(),
        telegram_bot_name: app.telegram_bot_name,
        network:           app.network,
        contract:          app.registry.into(),
    };
    let config_string = serde_json::to_string(&frontend_config)?;
    let index_html = reg.render_template(
        &index_template,
        &json!({ "config": config_string, "title": HTML_TITLE }),
    )?;

    let serve_dir_service = ServeDir::new(app.frontend_assets.join("assets"));

    let json_schema_service = ServeDir::new("json-schemas/telegram");
    let router = Router::new()
        .route("/", get(|| async { Html(index_html) }))
        .nest_service("/assets", serve_dir_service)
        .route("/credential", post(issue_telegram_credential))
        .nest_service("/json-schemas", json_schema_service)
        .with_state(state)
        .layer(cors)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(tower_http::trace::DefaultMakeSpan::new())
                .on_response(tower_http::trace::DefaultOnResponse::new()),
        )
        .layer(tower_http::timeout::TimeoutLayer::new(
            std::time::Duration::from_millis(app.request_timeout),
        ))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(100_000)) // at most 100kB of data.
        .layer(tower_http::compression::CompressionLayer::new());

    tracing::info!("Starting server on {}...", app.listen_address);

    // Start handling of shutdown signals now, before starting the server.
    let shutdown_signal = set_shutdown()?;

    axum::Server::bind(&app.listen_address)
        .serve(router.into_make_service())
        .with_graceful_shutdown(shutdown_signal)
        .await
        .context("Unable to start server.")
}
