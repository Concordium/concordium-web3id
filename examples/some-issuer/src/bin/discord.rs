use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use axum::extract::{Query, State};
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_sessions::async_session::CookieStore;
use axum_sessions::extractors::{ReadableSession, WritableSession};
use axum_sessions::SessionLayer;
use clap::Parser;
use concordium_rust_sdk::cis4::Cis4Contract;
use concordium_rust_sdk::contract_client::CredentialInfo;
use concordium_rust_sdk::types::{ContractAddress, Energy, WalletAccount};
use concordium_rust_sdk::v2::{self, BlockIdentifier};
use concordium_rust_sdk::web3id::did::Network;
use handlebars::Handlebars;
use http::{HeaderValue, StatusCode};
use rand::Rng;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use some_issuer::{issue_credential, IssueResponse, IssuerState};
use tonic::transport::ClientTlsConfig;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

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
        long = "dapp-domain",
        help = "The domain of the dApp, used for CORS.",
        default_value = "http://127.0.0.1",
        env = "DISCORD_ISSUER_DAPP_URL"
    )]
    dapp_domain: String,
}

#[derive(Clone)]
struct AppState {
    issuer: IssuerState,
    discord_client_id: Arc<String>,
    discord_client_secret: Arc<String>,
    http_client: reqwest::Client,
    handlebars: Arc<Handlebars<'static>>,
    discord_redirect_uri: Arc<Url>,
    dapp_domain: Arc<String>,
}

/// Request for issuance of Discord credential.
#[derive(Debug, Deserialize)]
struct DiscordIssueRequest {
    credential: CredentialInfo,
}

#[derive(Deserialize, Serialize, Debug)]
struct User {
    id: String,
    username: String,
    discriminator: String,
}

#[derive(Serialize)]
struct AccessTokenRequestData<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    grant_type: &'static str,
    code: &'a str,
    redirect_uri: &'a str,
}

#[derive(Deserialize)]
#[allow(unused)]
struct AccessTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u32,
    refresh_token: String,
    scope: String,
}

#[derive(Serialize)]
struct OauthTemplateParams<'a> {
    id: &'a str,
    username: &'a str,
    dapp_domain: &'a str,
}

/// Handles OAuth2 redirects and inserts an id in the session.
async fn handle_oauth_redirect(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    session: WritableSession,
) -> Result<Html<String>, StatusCode> {
    async fn respond(
        state: AppState,
        params: HashMap<String, String>,
        mut session: WritableSession,
    ) -> anyhow::Result<Html<String>> {
        let code = params.get("code").context("Missing 'code' query param")?;
        let user = get_user(&state, code)
            .await
            .context("Error getting Discord user.")?;
        session
            .insert("discord_id", &user.id)
            .expect("user ids can be serialized");

        // Discord added the option to get unique usernames. If the discriminator is "0", it
        // indicates that the user has a unique username.
        let username = if user.discriminator == "0" {
            user.username
        } else {
            format!("{}#{}", user.username, user.discriminator)
        };

        let params = OauthTemplateParams {
            id: &user.id,
            username: &username,
            dapp_domain: &state.dapp_domain,
        };

        let output = state
            .handlebars
            .render("oauth", &params)
            .expect("the oauth template can be rendered with a User struct");

        Ok(Html(output))
    }

    match respond(state, params, session).await {
        Ok(response) => Ok(response),
        Err(err) => {
            tracing::warn!("Unsuccessful OAuth2 redirect: {err}");
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

async fn issue_discord_credential(
    State(state): State<AppState>,
    session: ReadableSession,
    Json(request): Json<DiscordIssueRequest>,
) -> Result<Json<IssueResponse>, StatusCode> {
    let user_id = match session.get("discord_id") {
        Some(id) => id,
        None => {
            tracing::warn!("Missing session user id for Discord request.");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    issue_credential(state.issuer, request.credential, user_id).await
}

/// Exchanges an OAuth2 `code` for a User.
async fn get_user(state: &AppState, code: &str) -> anyhow::Result<User> {
    const API_ENDPOINT: &'static str = "https://discord.com/api/v10";
    let data = AccessTokenRequestData {
        client_id: &*state.discord_client_id,
        client_secret: &*state.discord_client_secret,
        grant_type: "authorization_code",
        code,
        redirect_uri: state.discord_redirect_uri.as_str(),
    };

    let response = state
        .http_client
        .post(format!("{API_ENDPOINT}/oauth2/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_urlencoded::to_string(data).unwrap())
        .send()
        .await?;
    anyhow::ensure!(
        response.status().is_success(),
        "user authetication failed: {}",
        response.text().await?
    );

    let response: AccessTokenResponse = serde_json::from_slice(&response.bytes().await?)?;
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

    let response = state
        .http_client
        .get(format!("{API_ENDPOINT}/users/@me"))
        .bearer_auth(response.access_token)
        .send()
        .await?;

    Ok(serde_json::from_slice(&response.bytes().await?)?)
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

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_millis(app.request_timeout))
        .build()?;

    let mut handlebars = Handlebars::new();
    handlebars.register_template_file("oauth", "./templates/discord-oauth.hbs")?;

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

    let discord_redirect_uri = app.url.join("discord-oauth2")?;
    let state = AppState {
        issuer,
        discord_client_id: Arc::new(app.discord_client_id),
        discord_client_secret: Arc::new(app.discord_client_secret),
        http_client,
        discord_redirect_uri: Arc::new(discord_redirect_uri),
        handlebars: Arc::new(handlebars),
        dapp_domain: Arc::new(app.dapp_domain.clone()),
    };

    let session_store = CookieStore::new();
    let mut session_secret = [0u8; 128];
    rand::thread_rng().fill(&mut session_secret);
    let session_layer = SessionLayer::new(session_store, &session_secret)
        .with_persistence_policy(axum_sessions::PersistencePolicy::ChangedOnly)
        .with_same_site_policy(axum_sessions::SameSite::None);

    let cors = CorsLayer::new()
        .allow_methods([http::Method::GET, http::Method::POST])
        .allow_origin(
            app.dapp_domain
                .parse::<HeaderValue>()
                .context("dApp domain was not valid.")?,
        )
        .allow_credentials(true)
        .allow_headers([http::header::CONTENT_TYPE]);

    let json_schema_service = ServeDir::new("json-schemas/discord");
    let router = Router::new()
        .route("/credential", post(issue_discord_credential))
        .route("/discord-oauth2", get(handle_oauth_redirect))
        .route_layer(session_layer)
        .nest_service("/json-schemas", json_schema_service)
        .layer(cors)
        .with_state(state);

    tracing::info!("Starting server on {}...", app.listen_address);

    axum::Server::bind(&app.listen_address)
        .serve(router.into_make_service())
        .await
        .context("Unable to start server.")
}
