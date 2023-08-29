use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use anyhow::Context;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, SecondsFormat, Utc};
use clap::Parser;
use concordium_rust_sdk::contract_client::CredentialStatus;
use concordium_rust_sdk::id::constants::{ArCurve, AttributeKind};
use concordium_rust_sdk::id::id_proof_types::{
    AtomicProof, AtomicStatement, RevealAttributeStatement,
};
use concordium_rust_sdk::smart_contracts::common::attributes;
use concordium_rust_sdk::types::{ContractAddress, CryptographicParameters};
use concordium_rust_sdk::v2::{self, BlockIdentifier};
use concordium_rust_sdk::web3id::did::Network;
use concordium_rust_sdk::web3id::{
    self, CredentialLookupError, CredentialProof, Presentation, PresentationVerificationError,
    Web3IdAttribute,
};
use db::{PlatformEntry, VerificationsEntry};
use futures::{future, TryFutureExt};
use reqwest::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use some_verifier_lib::{Account, Platform, Verification};
use tonic::transport::ClientTlsConfig;
use tower_http::services::ServeDir;

use crate::db::{Database, DbAccount};

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
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "SOME_VERIFIER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "port",
        default_value = "80",
        help = "Port of the SoMe verifier.",
        env = "SOME_VERIFIER_PORT"
    )]
    port: u16,
}

#[derive(Clone)]
struct AppState {
    http_client: reqwest::Client,
    node_client: v2::Client,
    telegram_registry: ContractAddress,
    discord_registry: ContractAddress,
    discord_bot_token: Arc<String>,
    database: Arc<Database>,
    network: Network,
    crypto_params: Arc<CryptographicParameters>,
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

    tracing::info!("Connecting to database...");
    let database = Database::connect(app.db_config).await?;

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

    let mut node_client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let crypto_params = node_client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get cryptographic parameters.")?
        .response;

    let http_client = reqwest::Client::new();

    let state = AppState {
        http_client,
        node_client,
        telegram_registry: app.telegram_registry,
        discord_registry: app.discord_registry,
        discord_bot_token: Arc::new(app.discord_bot_token),
        database: Arc::new(database),
        network: app.network,
        crypto_params: Arc::new(crypto_params),
    };

    tracing::info!("Starting server...");
    let serve_dir_service = ServeDir::new("frontend/dist");
    let router = Router::new()
        .nest_service("/", serve_dir_service)
        .route("/verifications", post(add_verification))
        .route("/verifications/remove", post(remove_verification))
        .route("/verifications/:platform/:id", get(get_verification))
        .with_state(state);

    let socket = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), app.port);
    axum::Server::bind(&socket)
        .serve(router.into_make_service())
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
    #[error("The database returned an error: {0}")]
    DatabaseError(#[from] tokio_postgres::Error),
}

impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        tracing::warn!("{}", self);

        let r = match self {
            Error::CredentialLookup(e) => (
                StatusCode::NOT_FOUND,
                Json(format!("One or more credentials were not found: {e}")),
            ),
            Error::DatabaseError(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(format!("{e}"))),
            error => (StatusCode::BAD_REQUEST, Json(format!("{}", error))),
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
    tracing::info!("Request to verify.");

    let request = request?;
    verify_request(&mut state, &request).await?;

    let Json(Request { proof, .. }) = request;

    // Check the statements and add them to the database
    let num_statements = proof.verifiable_credential.len();
    if num_statements < 2 {
        return Err(Error::NotEnoughStatements(num_statements));
    }

    let mut entry = VerificationsEntry::from_presentation(&proof);
    for proof in &proof.verifiable_credential {
        proof_to_verifications_entry(state.clone(), proof, &mut entry)?;
    }

    match state.database.add_verification(entry).await {
        Ok(()) => {}
        // TODO: duplicate/overlapping entries
        Err(err) => {
            tracing::warn!("Error inserting entries: {err}");
            return Err(Error::DatabaseError(err));
        }
    }

    tracing::info!("Successfully verified.");

    Ok(StatusCode::CREATED)
}

#[tracing::instrument(level = "info", skip_all)]
async fn remove_verification(
    State(mut state): State<AppState>,
    request: Result<Json<Request>, JsonRejection>,
) -> Result<StatusCode, Error> {
    tracing::info!("Request to remove verification.");

    let request = request?;
    verify_request(&mut state, &request).await?;

    let Json(Request { proof, .. }) = request;

    // Check the statements and add them to the database
    let num_creds = proof.verifiable_credential.len();
    if num_creds != 1 {
        return Err(Error::NotSingleStatement(num_creds));
    }

    // We know we have exactly 1 credential
    let credential = proof.verifiable_credential.get(0).unwrap();
    let (id, platform) = match credential {
        CredentialProof::Web3Id {
            network,
            contract,
            proofs,
            ..
        } => {
            if network != &state.network {
                return Err(Error::InvalidIssuer);
            }
            let platform = match contract {
                addr if addr == &state.telegram_registry => Platform::Telegram,
                addr if addr == &state.discord_registry => Platform::Discord,
                _ => return Err(Error::InvalidIssuer),
            };

            let id = match &proofs[..] {
                [(
                    _,
                    AtomicProof::RevealAttribute {
                        attribute: Web3IdAttribute::String(AttributeKind(id)),
                        ..
                    },
                )] => id.clone(),
                _ => {
                    return Err(Error::InvalidStatement);
                }
            };

            (id, platform)
        }
        _ => return Err(Error::InvalidStatement),
    };

    if let Err(err) = state.database.remove_verirication(&id, platform).await {
        tracing::warn!("Error inserting entries: {err}");
        return Err(Error::DatabaseError(err));
    }

    tracing::info!("Successfully removed verification.");

    Ok(StatusCode::OK)
}

async fn verify_request(state: &mut AppState, request: &Json<Request>) -> Result<(), Error> {
    let Json(Request { proof, timestamp }) = request;

    let delta = Utc::now().signed_duration_since(*timestamp);
    if delta.num_hours() > 24 {
        return Err(Error::InvalidTimestamp);
    }

    let bi = state
        .node_client
        .get_block_info(BlockIdentifier::LastFinal)
        .await
        .map_err(|e| Error::CredentialLookup(e.into()))?;
    let public_data =
        web3id::get_public_data(&mut state.node_client, state.network, &proof, bi.block_hash)
            .await?;

    // Check that all credentials are active at the time of the query
    if !public_data
        .iter()
        .all(|cm| matches!(cm.status, CredentialStatus::Active))
    {
        return Err(Error::InactiveCredentials);
    }
    // And then verify the cryptographic proofs
    let request = proof.verify(
        &state.crypto_params,
        public_data.iter().map(|cm| &cm.inputs),
    )?;

    // Check that the challenge is the hash of the supplied timestamp
    let iso_time = timestamp.to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut hasher = Sha256::new();
    hasher.update(iso_time.as_bytes());
    let hash = hasher.finalize();

    if &request.challenge[..] != &hash[..] {
        return Err(Error::InvalidChallenge);
    }

    Ok(())
}

fn proof_to_verifications_entry(
    state: AppState,
    proof: &CredentialProof<ArCurve, Web3IdAttribute>,
    entry: &mut VerificationsEntry,
) -> Result<(), Error> {
    match proof {
        // Platform verification (Telegram, Discord, etc.)
        CredentialProof::Web3Id {
            network,
            contract,
            proofs,
            ..
        } => {
            if network != &state.network {
                return Err(Error::InvalidIssuer);
            }

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

            let platform_entry = PlatformEntry { id, username };
            match contract {
                addr if addr == &state.telegram_registry => entry.telegram = Some(platform_entry),
                addr if addr == &state.discord_registry => entry.discord = Some(platform_entry),
                _ => return Err(Error::InvalidIssuer),
            }

            Ok(())
        }
        // Full name
        CredentialProof::Account {
            network, proofs, ..
        } => {
            if network != &state.network {
                return Err(Error::InvalidIssuer);
            }

            // There should be exactly a first and last name
            if !proofs.len() == 2 {
                return Err(Error::InvalidStatement);
            }

            for (statement, proof) in proofs {
                let name = match proof {
                    AtomicProof::RevealAttribute {
                        attribute: Web3IdAttribute::String(AttributeKind(name)),
                        ..
                    } => name,
                    _ => return Err(Error::InvalidStatement),
                };
                match statement {
                    AtomicStatement::RevealAttribute {
                        statement: RevealAttributeStatement { attribute_tag },
                    } => {
                        if attribute_tag.0 == attributes::FIRST_NAME.0 {
                            entry.first_name = Some(name.clone());
                        } else if attribute_tag.0 == attributes::LAST_NAME.0 {
                            entry.last_name = Some(name.clone());
                        } else {
                            return Err(Error::InvalidStatement);
                        }
                    }
                    _ => return Err(Error::InvalidStatement),
                }
            }

            Ok(())
        }
    }
}

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
                    get_revocation_status(acc),
                )
                .map_ok(|(platform, username, revoked)| Account {
                    platform,
                    username,
                    revoked,
                })
            });

            // Keep all the non-error values since the others could not get a username
            // or a revocation status for whatever reason, probably because the user
            // is not verified with that platform
            let accounts = future::join_all(futures)
                .await
                .into_iter()
                .filter_map(|res| res.ok())
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

const DISCORD_API_ENDPOINT: &'static str = "https://discord.com/api/v10";

#[derive(Deserialize)]
struct DiscordUser {
    username: String,
    discriminator: String,
}

/// Looks up the username of the given account.
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

async fn get_revocation_status(_account: &DbAccount) -> anyhow::Result<bool> {
    // TODO: Look up on chain
    Ok(false)
}
