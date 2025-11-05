use anyhow::Context;
use axum::{
    extract::rejection::JsonRejection,
    http::{self, StatusCode},
    routing::{get, post},
    Json, Router,
};
use axum_prometheus::PrometheusMetricLayerBuilder;
use clap::Parser;
use concordium_rust_sdk::{
    contract_client::CredentialStatus,
    id::{constants::ArCurve, types::GlobalContext},
    types::hashes::BlockHash,
    v2::{self, BlockIdentifier, Scheme},
    web3id::{
        self, did::Network, CredentialLookupError, Presentation, PresentationVerificationError,
        Web3IdAttribute,
    },
};
use futures::{Future, FutureExt};
use web3id_verifier::{configuration::Cli, service};
use std::sync::Arc;
use tonic::transport::ClientTlsConfig;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse};

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
    client: v2::Client,
    network: Network,
    params: Arc<GlobalContext<ArCurve>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    block: BlockHash,
    block_time: chrono::DateTime<chrono::Utc>,
    #[serde(flatten)]
    request: web3id::Request<ArCurve, Web3IdAttribute>,
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

    let cli = Cli::parse();

    {
        use tracing_subscriber::prelude::*;
        let log_filter = tracing_subscriber::filter::Targets::new()
            .with_target(module_path!(), cli.log_level)
            .with_target("tower_http", cli.log_level);
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
            .init();
    }

    {
        tracing::info!("Starting service version {}", env!("CARGO_PKG_VERSION"));
        tracing::info!("Connecting to node at {}", cli.endpoint.uri());
        tracing::info!("On network: {}", cli.network);
        tracing::info!("Listening on: {}", cli.listen_address);
    }

    anyhow::ensure!(
        cli.request_timeout >= 1000,
        "Request timeout should be at least 1s."
    );

    /* 
    let endpoint = if cli.endpoint.uri().scheme() == Some(&Scheme::HTTPS) {
        cli.endpoint
            .tls_config(ClientTlsConfig::new())
            .context("Unable to construct TLS configuration for Concordium API.")?
    } else {
        cli.endpoint
    };

    // Make it 500ms less than request timeout to make sure we can fail properly
    // with a connection timeout in case of node connectivity problems.
    let node_timeout = std::time::Duration::from_millis(cli.request_timeout - 500);

    let endpoint = endpoint
        .connect_timeout(node_timeout)
        .timeout(node_timeout)
        .http2_keep_alive_interval(std::time::Duration::from_secs(300))
        .keep_alive_timeout(std::time::Duration::from_secs(10))
        .keep_alive_while_idle(true);

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
        network: cli.network,
        params: Arc::new(params),
    };
    */
    // build routes
    /* 
    let server = Router::new()
        .route("/v0/verify", post(verify_presentation))
        .route("/v0/health", get(health))
        .with_state(state)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().include_headers(cli.log_headers))
                .on_response(DefaultOnResponse::new().include_headers(cli.log_headers)),
        )
        .layer(tower_http::timeout::TimeoutLayer::new(
            std::time::Duration::from_millis(cli.request_timeout),
        ))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(100_000)) // at most 100kB of data.
        .layer(tower_http::cors::CorsLayer::permissive().allow_methods([http::Method::POST]))
        .layer(prometheus_layer);

    let shutdown_signal = set_shutdown()?;
    let server_handle = tokio::spawn(async move {
        axum::Server::bind(&cli.listen_address)
            .serve(server.into_make_service())
            .with_graceful_shutdown(shutdown_signal)
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
    */


    service::run_service(cli).await

}
