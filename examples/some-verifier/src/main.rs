use crate::db::{Database, DbAccount};
use anyhow::Context;
use axum::{
    extract::{rejection::JsonRejection, Path, State},
    response::Html,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{DateTime, SecondsFormat, Utc};
use clap::Parser;
use concordium_rust_sdk::{
    cis4::Cis4Contract,
    contract_client::CredentialStatus,
    id::{
        constants::{ArCurve, AttributeKind},
        id_proof_types::{AtomicProof, AtomicStatement, RevealAttributeStatement},
    },
    smart_contracts::common::attributes,
    types::{ContractAddress, CryptographicParameters},
    v2::{self, BlockIdentifier, Scheme},
    web3id::{
        self, did::Network, CredentialLookupError, CredentialProof, CredentialStatement,
        Presentation, PresentationVerificationError, Web3IdAttribute,
    },
};
use db::{PlatformEntry, VerificationsEntry};
use futures::{future, TryFutureExt};
use handlebars::Handlebars;
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use some_verifier_lib::{Account, FullName, Platform, Verification};
use std::{collections::HashMap, fs, sync::Arc};
use tonic::transport::ClientTlsConfig;
use tower_http::services::ServeDir;

mod db;

#[derive(clap::Parser, Debug)]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "SOME_VERIFIER_NODE"
    )]
    endpoint: v2::Endpoint,
    #[clap(
        long = "network",
        help = "Network to which the verifier is connected.",
        default_value = "testnet",
        env = "SOME_VERIFIER_NETWORK"
    )]
    network: Network,
    #[clap(
        long = "telegram-registry",
        help = "Address of the Telegram registry smart contract.",
        env = "SOME_VERIFIER_TELEGRAM_REGISTRY_ADDRESS"
    )]
    telegram_registry: ContractAddress,
    #[clap(
        long = "discord-registry",
        help = "Address of the Discord registry smart contract.",
        env = "SOME_VERIFIER_DISCORD_REGISTRY_ADDRESS"
    )]
    discord_registry: ContractAddress,
    #[clap(
        long = "telegram-bot-name",
        help = "The name (handle) of the Telegram bot.",
        env = "SOME_VERIFIER_TELEGRAM_BOT_NAME"
    )]
    telegram_bot_name: String,
    #[clap(
        long = "discord-bot-token",
        help = "Discord bot token for looking up usernames.",
        env = "SOME_VERIFIER_DISCORD_BOT_TOKEN"
    )]
    discord_bot_token: String,
    #[clap(
        long = "discord-client-id",
        help = "Discord client id for OAuth2.",
        env = "SOME_VERIFIER_DISCORD_CLIENT_ID"
    )]
    discord_client_id: String,
    #[clap(
        long = "telegram-issuer-url",
        default_value = "http://127.0.0.1:8080",
        help = "URL of the Telegram Issuer.",
        env = "SOME_VERIFIER_TELEGRAM_ISSUER_URL"
    )]
    telegram_issuer_url: Url,
    #[clap(
        long = "discord-issuer-url",
        default_value = "http://127.0.0.1:8081",
        help = "URL of the Discord Issuer.",
        env = "SOME_VERIFIER_DISCORD_ISSUER_URL"
    )]
    discord_issuer_url: Url,
    #[clap(
        long = "db",
        default_value = "host=localhost dbname=some-verifier user=postgres password=password \
                         port=5432",
        help = "Database connection string.",
        env = "SOME_VERIFIER_DB_STRING"
    )]
    db_config: tokio_postgres::Config,
    #[clap(
        long = "db-pool-size",
        default_value = "16",
        help = "Maximum size of the database connection pool.",
        env = "SOME_VERIFIER_DB_POOL_SIZE"
    )]
    pool_size: usize,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "SOME_VERIFIER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "request-timeout",
        help = "Request timeout (both of request to the node and server requests) in milliseconds.",
        default_value = "5000",
        env = "SOME_VERIFIER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "port",
        default_value = "0.0.0.0:80",
        help = "Address where the server will listen on.",
        env = "SOME_VERIFIER_LISTEN_ADDRESS"
    )]
    listen_address: std::net::SocketAddr,
    #[clap(
        long = "frontend",
        default_value = "./frontend/dist",
        help = "Path to the directory where frontend assets are located.",
        env = "SOME_VERIFIER_FRONTEND"
    )]
    frontend_assets: std::path::PathBuf,
    #[clap(
        long = "telegram-invite-link",
        default_value = "https://t.me/",
        help = "Link to a group where the Telegram bot is active.",
        env = "SOME_VERIFIER_TELEGRAM_INVITE_LINK"
    )]
    telegram_invite_link: Url,
    #[clap(
        long = "discord-invite-link",
        default_value = "https://discord.gg/",
        help = "Link to a server where the Discord bot is active.",
        env = "SOME_VERIFIER_DISCORD_INVITE_LINK"
    )]
    discord_invite_link: Url,
}

#[derive(Clone)]
struct AppState {
    http_client: reqwest::Client,
    node_client: v2::Client,
    telegram_registry: ContractAddress,
    discord_registry: ContractAddress,
    telegram_contract: Cis4Contract,
    discord_contract: Cis4Contract,
    discord_bot_token: Arc<String>,
    database: Arc<Database>,
    network: Network,
    crypto_params: Arc<CryptographicParameters>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendConfig {
    discord_client_id: String,
    telegram_bot_name: String,
    network: Network,
    telegram_invite_link: Url,
    discord_invite_link: Url,
    issuers: HashMap<String, IssuerConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssuerConfig {
    url: String,
    index: String,
    subindex: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        let log_filter = tracing_subscriber::filter::Targets::new()
            .with_target(module_path!(), app.log_level)
            .with_target("tower_http", app.log_level);

        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
            .init();
    }

    tracing::info!("Connecting to database...");
    let database = Database::connect(app.db_config, app.pool_size).await?;

    anyhow::ensure!(
        app.request_timeout >= 1000,
        "Request timeout should be at least 1s."
    );

    let endpoint = if app.endpoint.uri().scheme() == Some(&Scheme::HTTPS) {
        app.endpoint
            .tls_config(ClientTlsConfig::new())
            .context("Unable to construct TLS configuration for Concordium API.")?
    } else {
        app.endpoint
    };

    // Make it 500ms less than request timeout to make sure we can fail properly
    // with a connection timeout in case of node connectivity problems.
    let node_timeout = std::time::Duration::from_millis(app.request_timeout - 500);

    let endpoint = endpoint
        .connect_timeout(node_timeout)
        .timeout(node_timeout)
        .http2_keep_alive_interval(std::time::Duration::from_secs(300))
        .keep_alive_timeout(std::time::Duration::from_secs(10))
        .keep_alive_while_idle(true);

    let mut node_client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let crypto_params = node_client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get cryptographic parameters.")?
        .response;

    let telegram_contract =
        Cis4Contract::create(node_client.clone(), app.telegram_registry).await?;
    let discord_contract = Cis4Contract::create(node_client.clone(), app.discord_registry).await?;

    let http_client = reqwest::Client::new();

    let state = AppState {
        http_client,
        node_client,
        telegram_registry: app.telegram_registry,
        discord_registry: app.discord_registry,
        telegram_contract,
        discord_contract,
        discord_bot_token: Arc::new(app.discord_bot_token),
        database: Arc::new(database),
        network: app.network,
        crypto_params: Arc::new(crypto_params),
    };

    // Render index.html with config
    let index_template = fs::read_to_string(app.frontend_assets.join("index.html"))
        .context("Frontend was not built.")?;
    let mut reg = Handlebars::new();
    // Prevent handlebars from escaping inserted object
    reg.register_escape_fn(|s| s.into());
    let frontend_config = FrontendConfig {
        discord_client_id: app.discord_client_id,
        telegram_bot_name: app.telegram_bot_name,
        network: app.network,
        telegram_invite_link: app.telegram_invite_link,
        discord_invite_link: app.discord_invite_link,
        issuers: [
            (
                "telegram".to_string(),
                IssuerConfig {
                    url: app.telegram_issuer_url.to_string(),
                    index: app.telegram_registry.index.to_string(),
                    subindex: app.telegram_registry.subindex.to_string(),
                },
            ),
            (
                "discord".to_string(),
                IssuerConfig {
                    url: app.discord_issuer_url.to_string(),
                    index: app.discord_registry.index.to_string(),
                    subindex: app.discord_registry.subindex.to_string(),
                },
            ),
        ]
        .into(),
    };
    let config_string = serde_json::to_string(&frontend_config)?;
    let index_html = reg.render_template(&index_template, &json!({ "config": config_string }))?;

    tracing::info!("Starting server...");
    let serve_dir_service = ServeDir::new(app.frontend_assets.join("assets"));
    let router = Router::new()
        .route("/", get(|| async { Html(index_html) }))
        .nest_service("/assets", serve_dir_service)
        .route("/verifications", post(add_verification))
        .route("/verifications", patch(remove_verification))
        .route("/verifications/:platform/:id", get(get_verification))
        .route("/health", get(health))
        .with_state(state)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(tower_http::trace::DefaultMakeSpan::new())
                .on_response(tower_http::trace::DefaultOnResponse::new()),
        )
        .layer(tower_http::timeout::TimeoutLayer::new(
            std::time::Duration::from_millis(app.request_timeout),
        ))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1_000_000)) // at most 1000kB of data.
        .layer(tower_http::compression::CompressionLayer::new());

    let socket = app.listen_address;
    let shutdown_signal = set_shutdown()?;
    axum::Server::bind(&socket)
        .serve(router.into_make_service())
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    Ok(())
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Timestamp did not match the current time.")]
    InvalidTimestamp,
    #[error("Unable to look up all credentials: {0}")]
    CredentialLookup(#[from] CredentialLookupError),
    #[error("One or more credentials are not active.")]
    InactiveCredentials,
    #[error("Invalid proof: {0}")]
    InvalidProof(#[from] PresentationVerificationError),
    #[error("Challenge did not match timestamp.")]
    InvalidChallenge,
    #[error("Expected at least 2 statements, got {0}.")]
    NotEnoughStatements(usize),
    #[error("Expected exactly 1 statement, got {0}.")]
    NotSingleStatement(usize),
    #[error("A statement was invalid.")]
    InvalidStatement,
    #[error("A statement was from the wrong issuer.")]
    InvalidIssuer,
    #[error("Attempt to add duplicate users: {0}")]
    DuplicateUserIds(anyhow::Error),
    #[error("The database returned an error: {0}")]
    Database(anyhow::Error),
}

impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        let r = match self {
            Error::CredentialLookup(e) => {
                tracing::debug!("Failed to look up credential: {e}");
                (
                    StatusCode::NOT_FOUND,
                    Json(format!("One or more credentials were not found: {e}")),
                )
            }
            Error::Database(e) => {
                tracing::error!("Internal error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, Json(format!("{e}")))
            }
            error => {
                tracing::debug!("Bad request: {error}");
                (StatusCode::BAD_REQUEST, Json(format!("{}", error)))
            }
        };
        r.into_response()
    }
}

#[derive(Deserialize)]
struct Request {
    proof: Presentation<ArCurve, Web3IdAttribute>,
    timestamp: DateTime<Utc>,
}

#[tracing::instrument(level = "info", skip_all)]
async fn add_verification(
    State(mut state): State<AppState>,
    request: Result<Json<Request>, JsonRejection>,
) -> Result<StatusCode, Error> {
    let Json(request) = request?;
    let _ = state.verify_request(&request).await?;
    // Check the statements and add them to the database
    let Request { proof, .. } = request;

    // Check the statements and add them to the database
    let num_statements = proof.verifiable_credential.len();
    if num_statements < 2 {
        return Err(Error::NotEnoughStatements(num_statements));
    }

    let mut entry = VerificationsEntry::from_presentation(&proof);
    for proof in &proof.verifiable_credential {
        state.proof_to_verifications_entry(proof, &mut entry)?;
    }

    match state.database.add_verification(entry).await {
        Ok(None) => {
            tracing::info!("Successfully added new verification.");
            Ok(StatusCode::CREATED)
        }
        Ok(Some(user_id)) => Err(Error::DuplicateUserIds(anyhow::anyhow!(
            "Duplicate user id: {user_id}."
        ))),
        Err(err) => {
            tracing::warn!("Error inserting entries: {err}");
            Err(Error::Database(err))
        }
    }
}

#[tracing::instrument(level = "info", skip_all)]
async fn remove_verification(
    State(mut state): State<AppState>,
    request: Result<Json<Request>, JsonRejection>,
) -> Result<StatusCode, Error> {
    let Json(request) = request?;
    let creds_with_metadata = state.verify_request(&request).await?;

    let Some((credential, &[])) = creds_with_metadata.credential_statements.split_first() else {
        return Err(Error::NotSingleStatement(
            creds_with_metadata.credential_statements.len(),
        ));
    };

    let CredentialStatement::Web3Id {
        contract,
        credential,
        ..
    } = credential
    else {
        return Err(Error::InvalidStatement);
    };

    let platform = state.get_platform_for_contract(contract)?;

    match state
        .database
        .remove_verification(credential, platform)
        .await
    {
        Ok(removed) => {
            if removed {
                tracing::debug!("Successfully removed verification for {credential}.");
                Ok(StatusCode::OK)
            } else {
                tracing::debug!(
                    "Request to remove a verification with a non-existing credential id."
                );
                Ok(StatusCode::BAD_REQUEST)
            }
        }
        Err(err) => {
            tracing::warn!("Error removing entries for {credential}: {err}");
            Err(Error::Database(err))
        }
    }
}

impl AppState {
    fn get_platform_for_contract(&self, address: &ContractAddress) -> Result<Platform, Error> {
        match address {
            addr if addr == &self.telegram_registry => Ok(Platform::Telegram),
            addr if addr == &self.discord_registry => Ok(Platform::Discord),
            _ => Err(Error::InvalidIssuer),
        }
    }

    pub(crate) fn proof_to_verifications_entry(
        &self,
        proof: &CredentialProof<ArCurve, Web3IdAttribute>,
        entry: &mut VerificationsEntry,
    ) -> Result<(), Error> {
        match proof {
            // Platform verification (Telegram, Discord, etc.)
            CredentialProof::Web3Id {
                contract,
                proofs,
                holder,
                ..
            } => {
                let (id, username) = match &proofs[..] {
                    [(
                        _,
                        AtomicProof::RevealAttribute {
                            attribute: Web3IdAttribute::String(AttributeKind(id)),
                            ..
                        },
                    ), (
                        _,
                        AtomicProof::RevealAttribute {
                            attribute: Web3IdAttribute::String(AttributeKind(username)),
                            ..
                        },
                    )] => (id.clone(), username.clone()),
                    _ => {
                        return Err(Error::InvalidStatement);
                    }
                };

                let platform_entry = PlatformEntry {
                    id,
                    cred_id: *holder,
                    username,
                };
                match self.get_platform_for_contract(contract)? {
                    Platform::Telegram => {
                        // Make sure we have two distinct statements.
                        if entry.telegram.replace(platform_entry).is_some() {
                            return Err(Error::InvalidStatement);
                        }
                    }
                    Platform::Discord => {
                        if entry.discord.replace(platform_entry).is_some() {
                            return Err(Error::InvalidStatement);
                        }
                    }
                };

                Ok(())
            }
            // Full name
            CredentialProof::Account { proofs, .. } => {
                // There should be exactly a first and last name
                if !proofs.len() == 2 {
                    return Err(Error::InvalidStatement);
                }

                let mut first_name = None;
                let mut last_name = None;
                for (statement, proof) in proofs {
                    let AtomicProof::RevealAttribute {
                        attribute: Web3IdAttribute::String(AttributeKind(name)),
                        ..
                    } = proof
                    else {
                        return Err(Error::InvalidStatement);
                    };
                    let AtomicStatement::RevealAttribute {
                        statement: RevealAttributeStatement { attribute_tag },
                    } = statement
                    else {
                        return Err(Error::InvalidStatement);
                    };
                    if attribute_tag.0 == attributes::FIRST_NAME.0 {
                        first_name = Some(name.clone());
                    } else if attribute_tag.0 == attributes::LAST_NAME.0 {
                        last_name = Some(name.clone());
                    } else {
                        return Err(Error::InvalidStatement);
                    }
                }
                let Some(first_name) = first_name else {
                    return Err(Error::InvalidStatement);
                };
                let Some(last_name) = last_name else {
                    return Err(Error::InvalidStatement);
                };
                if entry
                    .full_name
                    .replace(FullName {
                        first_name,
                        last_name,
                    })
                    .is_some()
                {
                    return Err(Error::InvalidStatement);
                }

                Ok(())
            }
        }
    }

    /// Verify the request. In particular this checks
    /// - all credentials mentioned in the request exist, and are active (in
    ///   particular they have not expired)
    /// - all credentials are on the required network
    /// - cryptographic proofs are valid
    /// - the timestamp in the request is no more than 10min from present.
    async fn verify_request(
        &mut self,
        request: &Request,
    ) -> Result<web3id::Request<ArCurve, Web3IdAttribute>, Error> {
        let Request { proof, timestamp } = request;

        let delta = Utc::now().signed_duration_since(*timestamp);
        if delta.num_minutes().abs() > 10 {
            return Err(Error::InvalidTimestamp);
        }

        // Check that the challenge is the hash of the supplied timestamp
        let iso_time = timestamp.to_rfc3339_opts(SecondsFormat::Millis, true);
        let hash = Sha256::digest(iso_time.as_bytes());

        if proof.presentation_context[..] != hash[..] {
            return Err(Error::InvalidChallenge);
        }

        let public_data = web3id::get_public_data(
            &mut self.node_client,
            self.network,
            proof,
            BlockIdentifier::LastFinal,
        )
        .await?;

        // Check that all credentials are active at the time of the query
        if !public_data
            .iter()
            .all(|cm| matches!(cm.status, CredentialStatus::Active))
        {
            return Err(Error::InactiveCredentials);
        }
        // And then verify the cryptographic proofs
        let request = proof.verify(&self.crypto_params, public_data.iter().map(|cm| &cm.inputs))?;

        Ok(request)
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

#[tracing::instrument(level = "info", skip_all)]
async fn get_verification(
    State(state): State<AppState>,
    Path((platform, id)): Path<(Platform, String)>,
) -> Result<Json<Verification>, StatusCode> {
    let verification = state.database.get_verification(&id, platform).await;
    match verification {
        Ok(Some(verification)) => {
            // Futures that simultaneously look up username and revocation status of user
            // The futures are then mapped to Accounts
            let futures = verification.accounts.iter().map(|acc| {
                future::try_join3(
                    async { Ok(acc.platform) },
                    get_username(&state, acc),
                    get_credential_status(&state, acc, &verification.presentation),
                )
                .map_ok(|(platform, username, cred_status)| Account {
                    platform,
                    username,
                    cred_status,
                })
            });

            // Keep all the non-error values since the others could not get a username
            // or a revocation status for whatever reason, probably because the user
            // is not verified with that platform
            let accounts = future::join_all(futures)
                .await
                .into_iter()
                .filter_map(|res| {
                    if let Err(e) = &res {
                        tracing::error!("Failed to look up user: {e}");
                    }
                    res.ok()
                })
                .collect();

            let result = Verification {
                accounts,
                full_name: verification.full_name,
            };

            Ok(Json(result))
        }
        Ok(None) => Ok(Json(Verification::default())),
        Err(err) => {
            tracing::error!("Database error when looking up verification: {err}");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

const DISCORD_API_ENDPOINT: &str = "https://discord.com/api/v10";

#[derive(Deserialize)]
struct DiscordUser {
    username: String,
    discriminator: String,
}

/// Looks up the username of the given account.
#[tracing::instrument(level = "debug", skip_all, fields(username = account.username, user_id = account.id))]
async fn get_username(state: &AppState, account: &DbAccount) -> anyhow::Result<String> {
    match account.platform {
        Platform::Telegram => Ok(account.username.clone()),
        Platform::Discord => {
            let user = state
                .http_client
                .get(format!("{DISCORD_API_ENDPOINT}/users/{}", account.id))
                .header("Authorization", format!("Bot {}", state.discord_bot_token))
                .send()
                .await?
                .json::<DiscordUser>()
                .await?;

            // Discord has two types of usernames, with discriminator (e.g. abcd#1234),
            // and without (e.g. abcdef). In the latter case, the discriminator is "0"
            let username = if user.discriminator == "0" {
                user.username
            } else {
                format!("{}#{}", user.username, user.discriminator)
            };
            Ok(username)
        }
    }
}

#[tracing::instrument(level = "debug", skip_all, fields(username = account.username, user_id = account.id), ret)]
async fn get_credential_status(
    state: &AppState,
    account: &DbAccount,
    proof: &Presentation<ArCurve, Web3IdAttribute>,
) -> anyhow::Result<CredentialStatus> {
    let (mut contract_client, registry) = match account.platform {
        Platform::Telegram => (state.telegram_contract.clone(), state.telegram_registry),
        Platform::Discord => (state.discord_contract.clone(), state.discord_registry),
    };

    let cred_id = proof
        .metadata()
        .find_map(|cred| match cred.cred_metadata {
            web3id::CredentialMetadata::Web3Id { contract, holder } if contract == registry => {
                Some(holder)
            }
            _ => None,
        })
        .with_context(|| format!("No credential for {} in presentation", account.platform))?;

    contract_client
        .credential_status(cred_id, BlockIdentifier::LastFinal)
        .await
        .context("Failed to get credential status")
}

/// Construct a future for shutdown signals (for unix: SIGINT and SIGTERM) (for
/// windows: ctrl c and ctrl break). The signal handler is set when the future
/// is polled and until then the default signal handler.
fn set_shutdown() -> anyhow::Result<impl futures::Future<Output = ()>> {
    use futures::FutureExt;
    #[cfg(unix)]
    {
        use tokio::signal::unix as unix_signal;

        let mut terminate_stream = unix_signal::signal(unix_signal::SignalKind::terminate())?;
        let mut interrupt_stream = unix_signal::signal(unix_signal::SignalKind::interrupt())?;

        Ok(async move {
            futures::future::select(
                Box::pin(terminate_stream.recv()),
                Box::pin(interrupt_stream.recv()),
            )
            .map(|_| ())
            .await
        })
    }
    #[cfg(windows)]
    {
        use tokio::signal::windows as windows_signal;

        let mut ctrl_break_stream = windows_signal::ctrl_break()?;
        let mut ctrl_c_stream = windows_signal::ctrl_c()?;

        Ok(async move {
            futures::future::select(
                Box::pin(ctrl_break_stream.recv()),
                Box::pin(ctrl_c_stream.recv()),
            )
            .map(|_| ())
            .await
        })
    }
}
