use anyhow::Context;
use axum::{
    extract::rejection::{JsonRejection, PathRejection},
    http::{self, StatusCode},
    routing::{get, post},
    Router,
};
use axum_prometheus::PrometheusMetricLayerBuilder;
use clap::Parser;
use concordium_rust_sdk::{
    cis4::{Cis4Contract, Cis4TransactionError, Cis4TransactionMetadata},
    common::types::{KeyPair, TransactionTime},
    contract_client::CredentialInfo,
    id::{constants::ArCurve, pedersen_commitment},
    smart_contracts::common::{Amount, Timestamp},
    types::{
        hashes::{BlockHash, TransactionHash},
        transactions::send::GivenEnergy,
        ContractAddress, CryptographicParameters, Energy, Nonce, WalletAccount,
    },
    v2::{self, BlockIdentifier, QueryError},
    web3id::{
        did::Network, CredentialHolderId, SignedCommitments, Web3IdAttribute, Web3IdCredential,
    },
};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::Arc,
};
use tonic::transport::ClientTlsConfig;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse};
use web3id_issuer::{IssueRequest, IssueResponse};

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "CONCORDIUM_WEB3ID_ISSUER_NODE"
    )]
    endpoint:            v2::Endpoint,
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_API_LISTEN_ADDRESS"
    )]
    listen_address:      std::net::SocketAddr,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_LEVEL"
    )]
    log_level:           tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_HEADERS"
    )]
    log_headers:         bool,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_WEB3ID_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout:     u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "CONCORDIUM_WEB3ID_ISSUER_REGISTRY_ADDRESS"
    )]
    registry:            ContractAddress,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "CONCORDIUM_WEB3ID_ISSUER_WALLET"
    )]
    wallet:              PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "CONCORDIUM_WEB3ID_ISSUER_KEY"
    )]
    issuer_key:          PathBuf,
    #[clap(
        long = "network",
        help = "Network on which this issuer operates.",
        env = "CONCORDIUM_WEB3ID_NETWORK"
    )]
    network:             Network,
    #[clap(
        long = "prometheus-address",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_PROMETHEUS_ADDRESS"
    )]
    prometheus_address:  Option<std::net::SocketAddr>,
    #[clap(
        long = "max-register-energy",
        help = "The amount of energy to allow for execution of the register credential \
                transaction. This must be less than max block energy of the chain the service is \
                connected to.",
        default_value = "10000",
        env = "CONCORDIUM_WEB3ID_ISSUER_MAX_REGISTER_ENERGY"
    )]
    max_register_energy: Energy,
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Unable to parse path: {0}")]
    InvalidPath(#[from] PathRejection),
    #[error("Unable to submit transaction: {0}")]
    CouldNotSubmit(#[from] Cis4TransactionError),
    #[error("Transaction query error: {0}.")]
    Query(#[from] QueryError),
    #[error("Internal error: {0}.")]
    Internal(String),
    #[error("Invalid time ranges.")]
    InvalidTimeRange,
    #[error("The network was not as expected.")]
    InvalidNetwork,
    #[error("Invalid Id.")]
    InvalidId,
}

impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        let r = match self {
            Error::InvalidRequest(e) => {
                tracing::warn!("Invalid request. Failed to parse presentation: {e}");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Invalid presentation format: {e}")),
                )
            }
            Error::InvalidPath(e) => {
                tracing::warn!("Invalid request. Failed to parse path: {e}");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Invalid path: {e}")),
                )
            }
            Error::InvalidTimeRange => {
                tracing::warn!("Invalid request. Validity range is not within allowed.");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json("Invalid validity range.".to_string()),
                )
            }
            Error::InvalidNetwork => {
                tracing::warn!(
                    "Invalid request. The network does not match the network the service is \
                     configured with."
                );
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json("Invalid network.".to_string()),
                )
            }
            Error::InvalidId => {
                tracing::warn!("Invalid request. Credential ID not a public key.");
                (StatusCode::BAD_REQUEST, axum::Json("Invalid ID.".to_string()))
            }
            Error::CouldNotSubmit(e) => {
                tracing::error!("Failed to submit transaction: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json("Could not submit transaction.".to_string()),
                )
            }
            Error::Internal(e) => {
                tracing::error!("Another internal error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json("Internal error.".to_string()),
                )
            }
            Error::Query(e) => {
                if e.is_not_found() {
                    (
                        StatusCode::NOT_FOUND,
                        axum::Json("Transaction not found.".to_string()),
                    )
                } else {
                    tracing::error!("Failed to query transaction: {e}");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        axum::Json("Could not query transaction.".to_string()),
                    )
                }
            }
        };
        r.into_response()
    }
}

#[derive(Clone, Debug)]
struct State {
    crypto_params:       Arc<CryptographicParameters>,
    client:              Cis4Contract,
    issuer:              Arc<WalletAccount>,
    issuer_key:          Arc<KeyPair>,
    nonce_counter:       Arc<tokio::sync::Mutex<Nonce>>,
    network:             Network,
    credential_schema:   String,
    credential_type:     BTreeSet<String>,
    max_register_energy: Energy,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "status")]
enum StatusResponse {
    #[serde(rename = "finalized")]
    Finalized { block: BlockHash, success: bool },
    #[serde(rename = "notFinalized")]
    NotFinalized,
}

#[tracing::instrument(level = "info", skip(state, tx))]
async fn status(
    axum::extract::State(mut state): axum::extract::State<State>,
    tx: Result<axum::extract::Path<TransactionHash>, PathRejection>,
) -> Result<axum::Json<StatusResponse>, Error> {
    let tx = tx?;
    let status = state.client.client.get_block_item_status(&tx).await?;
    if let Some((bh, summary)) = status.is_finalized() {
        Ok(axum::Json(StatusResponse::Finalized {
            block:   *bh,
            success: summary.is_success(),
        }))
    } else {
        Ok(axum::Json(StatusResponse::NotFinalized))
    }
}

fn make_secrets(
    state: &State,
    holder_id: CredentialHolderId,
    request: IssueRequest,
) -> Result<Web3IdCredential<ArCurve, Web3IdAttribute>, Error> {
    let mut randomness = BTreeMap::new();
    {
        let mut rng = rand::thread_rng();
        for idx in request.credential_subject.attributes.keys() {
            randomness.insert(
                idx.clone(),
                pedersen_commitment::Randomness::generate(&mut rng),
            );
        }
    }

    let signed_commitments = SignedCommitments::from_secrets(
        &state.crypto_params,
        &request.credential_subject.attributes,
        &randomness,
        &holder_id,
        state.issuer_key.as_ref(),
        state.client.address,
    )
    .ok_or_else(|| {
        Error::Internal("Incorrect number of values vs. randomness. This should not happen.".into())
    })?;

    Ok(Web3IdCredential {
        registry: state.client.address,
        issuer_key: state.issuer_key.public.into(),
        values: request.credential_subject.attributes,
        randomness,
        signature: signed_commitments.signature,
        holder_id,
        network: state.network,
        credential_type: state.credential_type.clone(),
        credential_schema: state.credential_schema.clone(),
        valid_from: request.valid_from,
        valid_until: request.valid_until,
    })
}

#[tracing::instrument(level = "info", skip(state, request))]
async fn issue_credential(
    axum::extract::State(mut state): axum::extract::State<State>,
    request: Result<axum::Json<IssueRequest>, JsonRejection>,
) -> Result<axum::Json<IssueResponse>, Error> {
    tracing::info!("Request to issue a credential.");
    let axum::Json(request) = request?;

    let mut nonce_guard = state.nonce_counter.lock().await;
    // compute expiry after acquiring the lock to make sure we don't wait
    // too long before acquiring the lock, rendering expiry problematic.
    let expiry = TransactionTime::minutes_after(5);
    tracing::info!("Using nonce {} to send the transaction.", *nonce_guard);
    let metadata = Cis4TransactionMetadata {
        sender_address: state.issuer.address,
        nonce: *nonce_guard,
        expiry,
        energy: GivenEnergy::Add(state.max_register_energy),
        amount: Amount::zero(),
    };

    let holder_id = request
        .credential_subject
        .id
        .ty
        .extract_public_key()
        .ok_or(Error::InvalidId)?
        .into();
    if request.credential_subject.id.network != state.network {
        return Err(Error::InvalidNetwork);
    }
    let valid_from = Timestamp::from_timestamp_millis(
        u64::try_from(request.valid_from.timestamp_millis())
            .map_err(|_| Error::InvalidTimeRange)?,
    );
    let valid_until = request
        .valid_until
        .map(|v| {
            u64::try_from(v.timestamp_millis())
                .map_err(|_| Error::InvalidTimeRange)
                .map(Timestamp::from_timestamp_millis)
        })
        .transpose()?;
    if let Some(vu) = valid_until {
        if vu < valid_from {
            return Err(Error::InvalidTimeRange);
        }
    }
    let cred_info = CredentialInfo {
        holder_id,
        holder_revocable: request.holder_revocable,
        valid_from,
        valid_until,
        metadata_url: request.metadata_url.clone(),
    };

    let tx_hash = state
        .client
        .register_credential(&*state.issuer, &metadata, &cred_info, &[])
        .await?;
    nonce_guard.next_mut();
    drop(nonce_guard);
    let credential = make_secrets(&state, holder_id, request)?;

    Ok(axum::Json(IssueResponse {
        tx_hash,
        credential,
    }))
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

    {
        tracing::info!("Starting service version {}", env!("CARGO_PKG_VERSION"));
        tracing::info!("Connecting to node at {}", app.endpoint.uri());
        tracing::info!("Listening on: {}", app.listen_address);
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

    let mut client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let issuer_key = Arc::new(
        serde_json::from_reader(&std::fs::File::open(&app.issuer_key)?)
            .context("Unable to read issuer's key.")?,
    );

    let issuer = Arc::new(WalletAccount::from_json_file(app.wallet)?);

    let nonce = client
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

    let crypto_params = client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await?
        .response;
    let mut client = Cis4Contract::create(client, app.registry).await?;

    let credential_schema = client.registry_metadata(BlockIdentifier::LastFinal).await?;

    let state = State {
        crypto_params: Arc::new(crypto_params),
        client,
        network: app.network,
        credential_schema: credential_schema.credential_schema.schema_ref.url().into(),
        credential_type: [
            "VerifiableCredential".into(),
            "ConcordiumVerifiableCredential".into(),
            credential_schema.credential_type.credential_type,
        ]
        .into_iter()
        .collect(),
        issuer,
        issuer_key,
        nonce_counter: Arc::new(tokio::sync::Mutex::new(nonce.nonce)),
        max_register_energy: app.max_register_energy,
    };

    let (prometheus_layer, metric_handle) = PrometheusMetricLayerBuilder::new()
        .with_default_metrics()
        .with_prefix("web3id-issuer")
        .build_pair();

    let prometheus_handle = if let Some(prometheus_address) = app.prometheus_address {
        let prometheus_api = axum::Router::new()
            .route(
                "/metrics",
                axum::routing::get(|| async move { metric_handle.render() }),
            )
            .layer(tower_http::timeout::TimeoutLayer::new(
                std::time::Duration::from_millis(1000),
            ))
            .layer(tower_http::limit::RequestBodyLimitLayer::new(0));
        Some(tokio::spawn(async move {
            axum::Server::bind(&prometheus_address)
                .serve(prometheus_api.into_make_service())
                .await
                .context("Unable to start Prometheus server.")?;
            Ok::<(), anyhow::Error>(())
        }))
    } else {
        None
    };

    // build routes
    let server = Router::new()
        .route("/v0/issue", post(issue_credential))
        .route("/v0/status/:transactionHash", get(status))
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http().
               make_span_with(DefaultMakeSpan::new().
                              include_headers(app.log_headers)).
               on_response(DefaultOnResponse::new().
                           include_headers(app.log_headers)))
        .layer(tower_http::timeout::TimeoutLayer::new(
            std::time::Duration::from_millis(app.request_timeout),
        ))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(100_000)) // at most 100kB of data.
        .layer(tower_http::cors::CorsLayer::permissive().allow_methods([http::Method::POST]))
        .layer(prometheus_layer);

    let server_handle = tokio::spawn(async move {
        axum::Server::bind(&app.listen_address)
            .serve(server.into_make_service())
            .await
    });

    if let Some(prometheus_handle) = prometheus_handle {
        tokio::select! {
            val = prometheus_handle => {
                val.context("Prometheus task panicked.")?.context("Prometheus server crashed.")?;
            }
            val = server_handle => {
                val.context("Server task panicked.")?.context("Server crashed.")?;
            }
        }
    } else {
        server_handle
            .await
            .context("Server task join error.")?
            .context("Server crashed.")?;
    }
    Ok(())
}
