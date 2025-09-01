use anyhow::Context;
use axum::{
    extract::rejection::{JsonRejection, PathRejection},
    http::{self, StatusCode},
    routing::{get, post},
    Router,
};
use clap::Parser;
use concordium_rust_sdk::{
    common::types::KeyPair,
    id::{constants::ArCurve, pedersen_commitment},
    types::{ContractAddress, CryptographicParameters},
    v2::{self, BlockIdentifier, Scheme},
    web3id::{CredentialHolderId, SignedCommitments, Web3IdAttribute},
};
use rand::SeedableRng;
use sha2::Digest;
use std::{collections::BTreeMap, path::PathBuf, sync::Arc};
use tonic::transport::ClientTlsConfig;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::{DefaultMakeSpan, DefaultOnResponse},
};

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://node.testnet.concordium.com:20000",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_NODE"
    )]
    endpoint:        v2::Endpoint,
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_LISTEN_ADDRESS"
    )]
    listen_address:  std::net::SocketAddr,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_LOG_LEVEL"
    )]
    log_level:       tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_LOG_HEADERS"
    )]
    log_headers:     bool,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "dir",
        help = "Serve the contents of the directory.",
        env = "CONCORDIUM_TEST_ISSUER_BACKEND_SERVE_DIR"
    )]
    serve_dir:       Option<PathBuf>,
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Unable to parse path: {0}")]
    InvalidPath(#[from] PathRejection),
    #[error("Internal error: {0}.")]
    Internal(String),
}

impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        let r = match self {
            Error::InvalidRequest(e) => {
                tracing::warn!("Invalid request. Failed to parse request body: {e}");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Invalid JSON format: {e}")),
                )
            }
            Error::InvalidPath(e) => {
                tracing::warn!("Invalid request. Failed to parse path: {e}");
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(format!("Invalid path: {e}")),
                )
            }
            Error::Internal(e) => {
                tracing::error!("Another internal error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json("Internal error.".to_string()),
                )
            }
        };
        r.into_response()
    }
}

#[derive(Clone, Debug)]
struct State {
    crypto_params: Arc<CryptographicParameters>,
}

fn make_keypair(seed: &[u8]) -> KeyPair {
    let mut rng = rand_chacha::ChaCha20Rng::from_seed(sha2::Sha256::digest(seed).into());
    KeyPair::generate(&mut rng)
}

#[tracing::instrument(level = "info")]
async fn get_keypair(
    seed: Result<axum::extract::Path<String>, PathRejection>,
) -> Result<axum::Json<KeyPair>, Error> {
    let seed = seed?;
    Ok(axum::Json(make_keypair(seed.as_bytes())))
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CommitmentsRequest {
    attributes: BTreeMap<String, Web3IdAttribute>,
    issuer:     ContractAddress,
    holder_id:  CredentialHolderId,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CommitmentsResponse {
    signed_commitments: SignedCommitments<ArCurve>,
    randomness:         BTreeMap<String, pedersen_commitment::Randomness<ArCurve>>,
}

#[tracing::instrument(level = "info", skip(state))]
async fn compute_commitments(
    axum::extract::State(state): axum::extract::State<State>,
    axum::extract::Path(seed): axum::extract::Path<String>,
    request: Result<axum::Json<CommitmentsRequest>, JsonRejection>,
) -> Result<axum::Json<CommitmentsResponse>, Error> {
    tracing::info!("Request to sign commitments.");
    let axum::Json(request) = request?;

    let issuer_kp = make_keypair(seed.as_bytes());

    let mut randomness = BTreeMap::new();
    {
        let mut rng = rand::thread_rng();
        for idx in request.attributes.keys() {
            randomness.insert(
                idx.clone(),
                pedersen_commitment::Randomness::generate(&mut rng),
            );
        }
    }

    let signed_commitments = SignedCommitments::from_secrets(
        &state.crypto_params,
        &request.attributes,
        &randomness,
        &request.holder_id,
        &issuer_kp,
        request.issuer,
    )
    .ok_or_else(|| {
        Error::Internal("Incorrect number of values vs. randomness. This should not happen.".into())
    })?;

    Ok(axum::Json(CommitmentsResponse {
        signed_commitments,
        randomness,
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

    let endpoint = if app.endpoint.uri().scheme() == Some(&Scheme::HTTPS) {
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

    let crypto_params = client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await?
        .response;

    let state = State {
        crypto_params: Arc::new(crypto_params),
    };

    // build routes
    let mut router = Router::new()
        .route("/v0/key/:seed", get(get_keypair))
        .route("/v0/commitments/:seed", post(compute_commitments));
    if let Some(serve_dir) = app.serve_dir {
        anyhow::ensure!(serve_dir.is_dir(), "The provided path is not a directory.");
        let mut index_html = serve_dir.clone();
        index_html.push("index.html");
        if index_html.is_file() {
            router = router.fallback_service(
                ServeDir::new(serve_dir).not_found_service(ServeFile::new(index_html)),
            );
        } else {
            router = router.fallback_service(ServeDir::new(serve_dir));
        }
    };
    let server = router
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
        .layer(tower_http::cors::CorsLayer::permissive().allow_methods([http::Method::GET, http::Method::POST]));

    let server_handle = tokio::spawn(async move {
        axum::Server::bind(&app.listen_address)
            .serve(server.into_make_service())
            .await
    });

    server_handle
        .await
        .context("Server task join error.")?
        .context("Server crashed.")?;
    Ok(())
}
