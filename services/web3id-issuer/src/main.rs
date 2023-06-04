use anyhow::Context;
use axum::{
    extract::rejection::JsonRejection,
    http::{self, StatusCode},
    routing::post,
    Router,
};
use axum_prometheus::PrometheusMetricLayerBuilder;
use clap::Parser;
use concordium_rust_sdk::{
    base as concordium_base,
    cis4::{Cis4Contract, Cis4TransactionError, Cis4TransactionMetadata},
    common::{self, types::TransactionTime, SerdeBase16Serialize},
    contract_client::CredentialInfo,
    smart_contracts::common::{self as concordium_std, Amount, Timestamp},
    types::{
        hashes::TransactionHash, transactions::send::GivenEnergy, ContractAddress, Nonce,
        WalletAccount,
    },
    v2,
    web3id::CredentialHolderId,
};
use std::{path::PathBuf, sync::Arc};
use tonic::transport::ClientTlsConfig;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse};

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
    endpoint:           v2::Endpoint,
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_API_LISTEN_ADDRESS"
    )]
    listen_address:     std::net::SocketAddr,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_LEVEL"
    )]
    log_level:          tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_HEADERS"
    )]
    log_headers:        bool,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_WEB3ID_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout:    u64,
    #[clap(
        long = "min-expiry",
        help = "Minimum transaction expiry time in milliseconds.",
        default_value = "15000",
        env = "CONCORDIUM_WEB3ID_ISSUER_MINIMUM_EXPIRY"
    )]
    min_allowed_expiry: u32,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "CONCORDIUM_WEB3ID_ISSUER_REGISTRY_ADDRESS"
    )]
    registry:           ContractAddress,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "CONCORDIUM_WEB3ID_ISSUER_WALLET"
    )]
    wallet:             PathBuf,
    #[clap(
        long = "prometheus-address",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_PROMETHEUS_ADDRESS"
    )]
    prometheus_address: Option<std::net::SocketAddr>,
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Unable to submit transaction: {0}")]
    CouldNotSubmit(#[from] Cis4TransactionError),
    #[error("Transaction expiry is too early in the future.")]
    ExpiryTooEarly,
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
            Error::CouldNotSubmit(e) => {
                tracing::error!("Failed to submit transaction: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(format!("Could not submit transaction.")),
                )
            }
            Error::ExpiryTooEarly => {
                tracing::warn!("Invalid request. Credential expiry is too early.");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Credential expiry is too early.")),
                )
            }
        };
        r.into_response()
    }
}

#[derive(Clone, Debug)]
struct State {
    client:             Cis4Contract,
    issuer:             Arc<WalletAccount>,
    nonce_counter:      Arc<tokio::sync::Mutex<Nonce>>,
    // In milliseconds
    min_allowed_expiry: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    transaction: TransactionHash,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueRequest {
    credential: CredentialInfo,
    signature:  Ed25519Signature,
    data:       DataToSign,
}

/// The parameter type for the contract function `serializationHelper`.
#[derive(concordium_std::Serialize, Debug, serde::Deserialize)]
// TODO: Serialize vec as hex.
pub struct DataToSign {
    /// A timestamp to make signatures expire.
    pub timestamp:            Timestamp,
    /// The contract_address that the signature is intended for.
    pub contract_address:     ContractAddress,
    /// Metadata associated with the credential.
    pub version:              u16,
    /// The serialized encrypted_credential.
    #[concordium(size_length = 2)]
    pub encrypted_credential: Vec<u8>,
}

#[derive(concordium_std::Serialize, common::Serialize, SerdeBase16Serialize, Debug)]
struct Ed25519Signature {
    sig: [u8; 64],
}

/// The parameter type for the contract function `store`.
#[derive(concordium_std::Serialize, Debug)]
pub struct StoreParam {
    /// Public key that created the above signature.
    pub public_key: CredentialHolderId,
    /// Signature.
    pub signature:  [u8; 64],
    // The signed data.
    pub data:       DataToSign,
}

#[tracing::instrument(level = "info", skip(state, request))]
async fn issue_credential(
    axum::extract::State(mut state): axum::extract::State<State>,
    request: Result<axum::Json<IssueRequest>, JsonRejection>,
) -> Result<axum::Json<TransactionHash>, Error> {
    let axum::Json(request) = request?;

    if request.data.timestamp.timestamp_millis()
        < (chrono::Utc::now().timestamp_millis() as u64).saturating_add(state.min_allowed_expiry)
    {
        return Err(Error::ExpiryTooEarly);
    }

    let expiry = TransactionTime::from_seconds(request.data.timestamp.timestamp_millis() / 1000);

    let storage_data = concordium_std::to_bytes(&StoreParam {
        public_key: request.credential.holder_id,
        signature:  request.signature.sig,
        data:       request.data,
    });

    let mut nonce_guard = state.nonce_counter.lock().await;
    let metadata = Cis4TransactionMetadata {
        sender_address: state.issuer.address,
        nonce: *nonce_guard,
        expiry,
        energy: GivenEnergy::Add(10_000.into()),
        amount: Amount::zero(),
    };

    let tx = state
        .client
        .register_credential(
            &*state.issuer,
            &metadata,
            &request.credential,
            &storage_data,
        )
        .await?;
    nonce_guard.next_mut();
    drop(nonce_guard);
    Ok(axum::Json(tx))
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

    let client = Cis4Contract::create(client, app.registry).await?;

    let state = State {
        client,
        issuer,
        nonce_counter: Arc::new(tokio::sync::Mutex::new(nonce.nonce)),
        min_allowed_expiry: app.min_allowed_expiry.into(),
    };

    let (prometheus_layer, metric_handle) = PrometheusMetricLayerBuilder::new()
        .with_default_metrics()
        .with_prefix("web3id-verifier")
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
