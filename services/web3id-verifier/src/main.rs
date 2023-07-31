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
    contract_client::CredentialStatus,
    id::{constants::ArCurve, types::GlobalContext},
    types::hashes::BlockHash,
    v2::{self, BlockIdentifier},
    web3id::{
        self, did::Network, CredentialLookupError, Presentation, PresentationVerificationError,
        Web3IdAttribute,
    },
};
use std::sync::Arc;
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
        env = "CONCORDIUM_WEB3ID_VERIFIER_NODE"
    )]
    endpoint:           v2::Endpoint,
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS"
    )]
    listen_address:     std::net::SocketAddr,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_LOG_LEVEL"
    )]
    log_level:          tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_LOG_HEADERS"
    )]
    log_headers:        bool,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT"
    )]
    request_timeout:    u64,
    #[clap(
        long = "network",
        help = "Network to which the verifier is connected.",
        default_value = "testnet",
        env = "CONCORDIUM_WEB3ID_VERIFIER_NETWORK"
    )]
    network:            Network,
    #[clap(
        long = "prometheus-address",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_PROMETHEUS_ADDRESS"
    )]
    prometheus_address: Option<std::net::SocketAddr>,
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Unable to look up all credentials: {0}")]
    CredentialLookup(#[from] CredentialLookupError),
    #[error("One or more credentials are not active.")]
    InactiveCredentials,
    #[error("Invalid proof: {0}.")]
    InvalidProof(#[from] PresentationVerificationError),
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
            Error::CredentialLookup(e) => {
                tracing::warn!("One or more credentials were not present: {e}");
                (
                    StatusCode::NOT_FOUND,
                    axum::Json(format!("One or more credentials were not found: {e}")),
                )
            }
            Error::InactiveCredentials => {
                tracing::warn!("One or more credentials are not active at present.");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json("One or more credentials are not active at present.".into()),
                )
            }
            Error::InvalidProof(e) => {
                tracing::warn!("Invalid cryptographic proofs: {e}");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Invalid cryptographic proofs: {e}.")),
                )
            }
        };
        r.into_response()
    }
}

#[derive(Clone, Debug)]
struct State {
    client:  v2::Client,
    network: Network,
    params:  Arc<GlobalContext<ArCurve>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    block:      BlockHash,
    block_time: chrono::DateTime<chrono::Utc>,
    #[serde(flatten)]
    request:    web3id::Request<ArCurve, Web3IdAttribute>,
}

#[tracing::instrument(level = "info", skip_all)]
async fn verify_presentation(
    axum::extract::State(mut state): axum::extract::State<State>,
    presentation: Result<axum::Json<Presentation<ArCurve, Web3IdAttribute>>, JsonRejection>,
) -> Result<axum::Json<Response>, Error> {
    let presentation = presentation?;
    let bi = state
        .client
        .get_block_info(BlockIdentifier::LastFinal)
        .await
        .map_err(|e| Error::CredentialLookup(e.into()))?;
    let public_data = web3id::get_public_data(
        &mut state.client,
        state.network,
        &presentation,
        bi.block_hash,
    )
    .await?;
    // Check that all credentials are active at the time of the query.
    if !public_data
        .iter()
        .all(|cm| matches!(cm.status, CredentialStatus::Active))
    {
        return Err(Error::InactiveCredentials);
    }
    // And then verify the cryptographic proofs.
    let request = presentation.verify(&state.params, public_data.iter().map(|cm| &cm.inputs))?;
    Ok(axum::Json(Response {
        block: bi.block_hash,
        block_time: bi.response.block_slot_time,
        request,
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
        tracing::info!("On network: {}", app.network);
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

    let params = client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get cryptographic parameters.")?
        .response;

    let state = State {
        client,
        network: app.network,
        params: Arc::new(params),
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
        .route("/v0/verify", post(verify_presentation))
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
