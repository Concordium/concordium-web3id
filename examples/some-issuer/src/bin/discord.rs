use anyhow::Context;
use axum::{
    extract::{Query, State},
    response::Html,
    routing::{get, post},
    Json, Router,
};
use axum_sessions::{
    async_session::CookieStore,
    extractors::{ReadableSession, WritableSession},
    SessionLayer,
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
use http::{HeaderValue, StatusCode};
use rand::Rng;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::json;
use some_issuer::{set_shutdown, IssueResponse, IssuerState, SyncState};
use std::{fs, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tonic::transport::ClientTlsConfig;
use tower_http::{cors::CorsLayer, services::ServeDir};

const DISCORD_API_ENDPOINT: &str = "https://discord.com/api/v10";
const HTML_TITLE: &str = "Discord Web3 ID issuer";
const OAUTH_TEMPLATE: &str = include_str!("../../templates/discord-oauth.hbs");

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "DISCORD_ISSUER_NODE"
    )]
    endpoint: v2::Endpoint,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "DISCORD_ISSUER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "network",
        help = "The network of the issuer.",
        default_value = "testnet",
        env = "DISCORD_ISSUER_NETWORK"
    )]
    network: Network,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "DISCORD_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "DISCORD_ISSUER_REGISTRY_ADDRESS"
    )]
    registry: ContractAddress,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "DISCORD_ISSUER_WALLET"
    )]
    wallet: PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "DISCORD_ISSUER_KEY"
    )]
    issuer_key: PathBuf,
    #[clap(
        long = "max-register-energy",
        help = "The amount of energy to allow for execution of the register credential \
                transaction. This must be less than max block energy of the chain the service is \
                connected to.",
        default_value = "10000",
        env = "DISCORD_ISSUER_MAX_REGISTER_ENERGY"
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
        long = "listen-address",
        help = "Socket addres for the Discord issuer.",
        default_value = "0.0.0.0:8081",
        env = "DISCORD_ISSUER_LISTEN_ADDRESS"
    )]
    listen_address: SocketAddr,
    #[clap(
        long = "url",
        help = "URL of the Discord issuer.",
        default_value = "http://127.0.0.1:8081/",
        env = "DISCORD_ISSUER_URL"
    )]
    url: Url,
    #[clap(
        long = "verifier-dapp-domain",
        help = "The domain of the verifier dApp, used for CORS.",
        default_value = "http://127.0.0.1",
        env = "DISCORD_ISSUER_VERIFIER_DAPP_URL"
    )]
    verifier_dapp_domain: String,
    #[clap(
        long = "frontend",
        default_value = "./frontend/dist/discord",
        help = "Path to the directory where frontend assets are located.",
        env = "DISCORD_ISSUER_FRONTEND"
    )]
    frontend_assets: std::path::PathBuf,
    #[clap(
        long = "rate-limit-capacity",
        help = "The number of issued credentials that we remember for rate limiting.",
        default_value = "50000",
        env = "DISCORD_ISSUER_RATE_LIMIT_CAPACITY"
    )]
    rate_limit_queue_capacity: usize,
    #[clap(
        long = "rate-limit-repeats",
        help = "The number of times the same user id can be issued before being rate limited.",
        default_value = "5",
        env = "DISCORD_ISSUER_RATE_LIMIT_REPEATS"
    )]
    rate_limit_max_repeats: usize,
}

#[derive(Clone)]
struct AppState {
    issuer:                IssuerState,
    discord_client_id:     Arc<str>,
    discord_client_secret: Arc<str>,
    http_client:           reqwest::Client,
    handlebars:            Arc<Handlebars<'static>>,
    discord_redirect_uri:  Arc<Url>,
    dapp_domain:           Arc<Url>,
    verifier_dapp_domain:  Arc<String>,
}

/// Request for issuance of Discord credential.
#[derive(Debug, Deserialize)]
struct DiscordIssueRequest {
    credential: CredentialInfo,
}

#[derive(Deserialize, Serialize, Debug)]
struct User {
    id:            String,
    username:      String,
    discriminator: String,
}

#[derive(Serialize)]
struct AccessTokenRequestData<'a> {
    client_id:     &'a str,
    client_secret: &'a str,
    grant_type:    &'static str,
    code:          &'a str,
    redirect_uri:  &'a str,
}

#[derive(Deserialize)]
struct AccessTokenResponse {
    access_token: String,
    token_type:   String,
    scope:        String,
}

#[derive(Deserialize, Debug)]
struct Oauth2RedirectParams {
    pub(crate) code:  Option<String>,
    pub(crate) error: Option<String>,
}

#[derive(Serialize)]
struct OauthTemplateParams<'a> {
    id:                   &'a str,
    username:             &'a str,
    dapp_domain:          &'a str,
    verifier_dapp_domain: &'a str,
}

#[derive(Serialize)]
struct OauthErrorParams<'a> {
    error:                &'a str,
    dapp_domain:          &'a str,
    verifier_dapp_domain: &'a str,
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
    discord_client_id: String,
    network:           Network,
    contract:          ContractConfig,
}

/// Handles OAuth2 redirects and inserts an id in the session.
#[tracing::instrument(level = "debug", skip(state))]
async fn handle_oauth_redirect(
    State(state): State<AppState>,
    Query(params): Query<Oauth2RedirectParams>,
    session: WritableSession,
) -> Result<Html<String>, StatusCode> {
    if let Some(code) = params.code {
        match state.make_oauth_redirect_response(code, session).await {
            Ok(response) => Ok(Html(response)),
            Err(err) => {
                tracing::warn!("Unsuccessful OAuth2 redirect: {err}");
                Err(StatusCode::BAD_REQUEST)
            }
        }
    } else if let Some(error) = params.error {
        let params = OauthErrorParams {
            error:                error.as_str(),
            dapp_domain:          &state.dapp_domain.to_string(),
            verifier_dapp_domain: &state.verifier_dapp_domain,
        };

        let output = state.handlebars.render("oauth", &params).map_err(|e| {
            tracing::warn!("Unable to render oauth template with an error: {e}.");
            StatusCode::BAD_REQUEST
        })?;
        Ok(Html(output))
    } else {
        tracing::warn!("Neither code nor error parameters are present.");
        Err(StatusCode::BAD_REQUEST)
    }
}

#[tracing::instrument(level = "debug", skip_all, fields(holder_id = %request.credential.holder_id))]
async fn issue_discord_credential(
    State(state): State<AppState>,
    session: ReadableSession,
    Json(request): Json<DiscordIssueRequest>,
) -> Result<Json<IssueResponse>, StatusCode> {
    tracing::debug!("Issuing Discord credential.");
    let user_id = match session.get("discord_id") {
        Some(id) => id,
        None => {
            tracing::warn!("Missing session user id for Discord request.");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    let username = match session.get("discord_username") {
        Some(username) => username,
        None => {
            tracing::warn!("Missing session username for Discord request.");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    state
        .issuer
        .issue_credential(&request.credential, user_id, username)
        .await
}

impl AppState {
    /// Exchanges an OAuth2 `code` for a User.
    pub(crate) async fn get_user(&self, code: &str) -> anyhow::Result<User> {
        let data = AccessTokenRequestData {
            client_id: &self.discord_client_id,
            client_secret: &self.discord_client_secret,
            grant_type: "authorization_code",
            code,
            redirect_uri: self.discord_redirect_uri.as_str(),
        };

        let response = self
            .http_client
            .post(format!("{DISCORD_API_ENDPOINT}/oauth2/token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(serde_urlencoded::to_string(data)?)
            .send()
            .await?;
        anyhow::ensure!(
            response.status().is_success(),
            "user authetication failed: {}",
            response.text().await?
        );

        let response: AccessTokenResponse = response.json().await?;
        anyhow::ensure!(
            response.token_type == "Bearer",
            "expected Bearer token, got '{}'",
            response.token_type
        );
        anyhow::ensure!(
            response.scope == "identify",
            "expected 'idenitfy' scope, got '{}'",
            response.scope
        );

        let response = self
            .http_client
            .get(format!("{DISCORD_API_ENDPOINT}/users/@me"))
            .bearer_auth(response.access_token)
            .send()
            .await?;
        anyhow::ensure!(
            response.status().is_success(),
            "Unable to get user information."
        );
        let user = response.json().await?;
        Ok(user)
    }

    pub(crate) async fn make_oauth_redirect_response(
        &self,
        code: String,
        mut session: WritableSession,
    ) -> anyhow::Result<String> {
        let user = self
            .get_user(&code)
            .await
            .context("Error getting Discord user.")?;

        // Discord added the option to get unique usernames. If the discriminator is
        // "0", it indicates that the user has a unique username.
        let username = if user.discriminator == "0" {
            user.username
        } else {
            format!("{}#{}", user.username, user.discriminator)
        };

        session
            .insert("discord_id", &user.id)
            .context("Cannot serialize user id.")?;
        session
            .insert("discord_username", &username)
            .context("Cannot serialize username.")?;

        let params = OauthTemplateParams {
            id:                   &user.id,
            username:             &username,
            dapp_domain:          &self.dapp_domain.to_string(),
            verifier_dapp_domain: &self.verifier_dapp_domain,
        };

        let output = self
            .handlebars
            .render("oauth", &params)
            .context("Unable to render oauth template with a User.")?;
        Ok(output)
    }
}

#[derive(serde::Serialize)]
struct Health {
    version: &'static str,
}

#[tracing::instrument(level = "info")]
async fn health() -> Json<Health> {
    Json(Health {
        version: env!("CARGO_PKG_VERSION"),
    })
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
    .connect_timeout(std::time::Duration::from_secs(5))
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

    let http_client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_millis(app.request_timeout))
        .build()?;

    let mut handlebars = Handlebars::new();
    handlebars.register_template_string("oauth", OAUTH_TEMPLATE)?;

    let metadata_url = app.url.join("json-schemas/credential-metadata.json")?;

    let registry_metadata = contract_client
        .registry_metadata(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get registry metadata")?;

    let issuer = IssuerState {
        crypto_params: Arc::new(crypto_params),
        contract_client,
        credential_type: registry_metadata.credential_type,
        network: app.network,
        issuer: Arc::new(issuer_account),
        issuer_key: Arc::new(issuer_key),
        state: Arc::new(tokio::sync::Mutex::new(SyncState::new(
            nonce.nonce,
            app.rate_limit_queue_capacity,
            app.rate_limit_max_repeats,
        ))),
        max_register_energy: app.max_register_energy,
        metadata_url: Arc::new(metadata_url),
        credential_schema_url: registry_metadata.credential_schema.schema_ref.url().into(),
    };

    let discord_redirect_uri = app.url.join("discord-oauth2")?;
    let state = AppState {
        issuer,
        discord_client_id: app.discord_client_id.clone().into(),
        discord_client_secret: app.discord_client_secret.into(),
        http_client,
        discord_redirect_uri: Arc::new(discord_redirect_uri),
        handlebars: Arc::new(handlebars),
        dapp_domain: Arc::new(app.url),
        verifier_dapp_domain: Arc::new(app.verifier_dapp_domain.clone()),
    };

    let session_store = CookieStore::new();
    let mut session_secret = [0u8; 128];
    rand::thread_rng().fill(&mut session_secret);
    let session_layer = SessionLayer::new(session_store, &session_secret)
        .with_persistence_policy(axum_sessions::PersistencePolicy::ChangedOnly)
        .with_same_site_policy(axum_sessions::SameSite::None)
        .with_http_only(true)
        .with_secure(true);

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
        config_type:       "discord".into(),
        discord_client_id: app.discord_client_id,
        network:           app.network,
        contract:          app.registry.into(),
    };
    let config_string = serde_json::to_string(&frontend_config)?;
    let index_html = reg.render_template(
        &index_template,
        &json!({ "config": config_string, "title": HTML_TITLE }),
    )?;

    let serve_dir_service = ServeDir::new(app.frontend_assets.join("assets"));
    let json_schema_service = ServeDir::new("json-schemas/discord");

    tracing::info!("Starting server...");
    let router = Router::new()
        .route("/", get(|| async { Html(index_html) }))
        .nest_service("/assets", serve_dir_service)
        .route("/credential", post(issue_discord_credential))
        .route("/discord-oauth2", get(handle_oauth_redirect))
        .route("/health", get(health))
        .route_layer(session_layer)
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
        .layer(tower_http::limit::RequestBodyLimitLayer::new(100_000)) // at most 100kB of data
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
