use anyhow::Context;
use axum::{
    extract::rejection::{JsonRejection, PathRejection},
    http::{self, StatusCode},
    routing::{get, post},
    Router,
};
use axum_prometheus::{
    metrics_exporter_prometheus::PrometheusHandle, PrometheusMetricLayerBuilder,
};
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
    v2::{self, upward::UnknownDataError, BlockIdentifier, QueryError, Scheme},
    web3id::{
        did::Network, CredentialHolderId, SignedCommitments, Web3IdAttribute, Web3IdCredential,
    },
};
use futures::{Future, FutureExt};
use std::{
    collections::{BTreeMap, BTreeSet},
    net::SocketAddr,
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
    endpoint: v2::Endpoint,
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_API_LISTEN_ADDRESS"
    )]
    listen_address: std::net::SocketAddr,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_WEB3ID_ISSUER_LOG_HEADERS"
    )]
    log_headers: bool,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_WEB3ID_ISSUER_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "registry",
        help = "Address of the registry smart contract.",
        env = "CONCORDIUM_WEB3ID_ISSUER_REGISTRY_ADDRESS"
    )]
    registry: ContractAddress,
    #[clap(
        long = "wallet",
        help = "Path to the wallet keys.",
        env = "CONCORDIUM_WEB3ID_ISSUER_WALLET"
    )]
    wallet: PathBuf,
    #[clap(
        long = "issuer-key",
        help = "Path to the issuer's key, used to sign commitments.",
        env = "CONCORDIUM_WEB3ID_ISSUER_KEY"
    )]
    issuer_key: PathBuf,
    #[clap(
        long = "network",
        help = "Network on which this issuer operates.",
        env = "CONCORDIUM_WEB3ID_NETWORK"
    )]
    network: Network,
    #[clap(
        long = "prometheus-address",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_ISSUER_PROMETHEUS_ADDRESS"
    )]
    prometheus_address: Option<std::net::SocketAddr>,
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

/// Data sent on a channel from the request handler task to the transaction
/// sender task.
#[derive(Debug)]
struct IssueChannelData {
    credential: CredentialInfo,
    /// The channel where the response is sent.
    response_sender: tokio::sync::oneshot::Sender<Result<TransactionHash, Error>>,
}

struct IssuerWorker {
    client: Cis4Contract,
    issuer: WalletAccount,
    nonce_counter: Nonce,
    max_register_energy: Energy,
    /// A channel where new issue requests will be given.
    receiver: tokio::sync::mpsc::Receiver<IssueChannelData>,
}

impl IssuerWorker {
    /// A transaction sender job. This listens for incoming issue requests and
    /// sends transactions to the chain.
    ///
    /// This is intended to be run in a background task that is started once.
    /// The task is not cancel-safe in the sense that if it is cancelled, the
    /// state of [`IssuerWorker`] might be inconsistent. This is why this
    /// function consumes `self`.
    #[tracing::instrument(level = "debug", skip_all)]
    async fn tx_sender(mut self) {
        while let Some(IssueChannelData {
            credential,
            response_sender,
        }) = self.receiver.recv().await
        {
            let expiry = TransactionTime::minutes_after(5);
            let metadata = Cis4TransactionMetadata {
                sender_address: self.issuer.address,
                nonce: self.nonce_counter,
                expiry,
                energy: GivenEnergy::Add(self.max_register_energy),
                amount: Amount::zero(),
            };

            let res = self.register_credential(&credential, &metadata).await;
            if response_sender.send(res).is_err() {
                tracing::warn!("Unabled to send response. The request has been cancelled.");
            }
        }
    }

    #[tracing::instrument(level = "debug", skip_all, fields(holder_id = %credential.holder_id))]
    async fn register_credential(
        &mut self,
        credential: &CredentialInfo,
        metadata: &Cis4TransactionMetadata,
    ) -> Result<TransactionHash, Error> {
        tracing::info!(
            "Using nonce {} to send the transaction.",
            self.nonce_counter
        );

        let tx_hash = self
            .client
            .register_credential(&self.issuer, metadata, credential, &[])
            .await?;
        self.nonce_counter.next_mut();
        Ok(tx_hash)
    }
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Unable to parse request: {0}")]
    InvalidRequest(#[from] JsonRejection),
    #[error("Unable to parse path: {0}")]
    InvalidPath(#[from] PathRejection),
    #[error("Unable to submit transaction: {0}")]
    CouldNotSubmit(#[from] Cis4TransactionError),
    #[error("Forward incompatible: {0}")]
    UnknownData(#[from] UnknownDataError),
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
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json("Invalid ID.".to_string()),
                )
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
            Error::UnknownData(e) => {
                tracing::error!("Unknown data type: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(
                        "Unknown data type from a future protocol."
                            .to_string(),
                    ),
                )
            }
        };
        r.into_response()
    }
}

#[derive(Clone, Debug)]
struct State {
    crypto_params: Arc<CryptographicParameters>,
    client: Cis4Contract,
    issuer_key: Arc<KeyPair>,
    network: Network,
    credential_schema: String,
    credential_type: BTreeSet<String>,
    // A channel where new issue requests should be sent to the worker.
    sender: tokio::sync::mpsc::Sender<IssueChannelData>,
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
        issuer_key: state.issuer_key.public().into(),
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
            block: *bh,
            success: summary.is_success().known_or_err()?,
        }))
    } else {
        Ok(axum::Json(StatusResponse::NotFinalized))
    }
}

#[tracing::instrument(level = "info", skip(state, request))]
async fn issue_credential(
    axum::extract::State(state): axum::extract::State<State>,
    request: Result<axum::Json<IssueRequest>, JsonRejection>,
) -> Result<axum::Json<IssueResponse>, Error> {
    tracing::info!("Request to issue a credential.");
    let axum::Json(request) = request?;

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

    let (response_sender, response_receiver) = tokio::sync::oneshot::channel();
    // Ask the issuer worker to send the transaction.
    if state
        .sender
        .send(IssueChannelData {
            credential: cred_info,
            response_sender,
        })
        .await
        .is_err()
    {
        tracing::error!("Failed enqueueing transaction. The transaction sender task died.");
        return Err(Error::Internal("Failed sending transaction.".into()));
    }

    if let Ok(r) = response_receiver.await {
        let tx_hash = r?;
        let credential = make_secrets(&state, holder_id, request)?;
        Ok(axum::Json(IssueResponse {
            tx_hash,
            credential,
        }))
    } else {
        // There is no information in the error.
        tracing::error!(
            "Failed sending transaction; did not get response from transaction sender."
        );
        Err(Error::Internal("Failed sending transaction.".into()))
    }
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
    .timeout(std::time::Duration::from_millis(app.request_timeout))
    .http2_keep_alive_interval(std::time::Duration::from_secs(300))
    .keep_alive_timeout(std::time::Duration::from_secs(10))
    .keep_alive_while_idle(true);

    let mut client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let issuer_key = serde_json::from_reader(&std::fs::File::open(&app.issuer_key)?)
        .context("Unable to read issuer's key.")?;

    let issuer = WalletAccount::from_json_file(app.wallet)?;

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

    let (issuer_sender, issuer_receiver) = tokio::sync::mpsc::channel(100);

    let worker = IssuerWorker {
        client: client.clone(),
        issuer,
        nonce_counter: nonce.nonce,
        max_register_energy: app.max_register_energy,
        receiver: issuer_receiver,
    };

    let state = State {
        client,
        crypto_params: Arc::new(crypto_params),
        network: app.network,
        credential_schema: credential_schema.credential_schema.schema_ref.url().into(),
        credential_type: [
            "VerifiableCredential".into(),
            "ConcordiumVerifiableCredential".into(),
            credential_schema.credential_type.credential_type,
        ]
        .into_iter()
        .collect(),
        issuer_key: Arc::new(issuer_key),
        sender: issuer_sender,
    };

    let (prometheus_layer, metric_handle) = PrometheusMetricLayerBuilder::new()
        .with_prefix("web3id-issuer")
        .with_default_metrics()
        .build_pair();

    // build routes
    let router = Router::new()
        .route("/v0/issue", post(issue_credential))
        .route("/v0/status/:transactionHash", get(status))
        .with_state(state)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().include_headers(app.log_headers))
                .on_response(DefaultOnResponse::new().include_headers(app.log_headers)),
        )
        .layer(tower_http::timeout::TimeoutLayer::new(
            std::time::Duration::from_millis(app.request_timeout),
        ))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(100_000)) // at most 100kB of data.
        .layer(tower_http::cors::CorsLayer::permissive().allow_methods([http::Method::POST]))
        .layer(prometheus_layer);

    start_services(
        worker,
        metric_handle,
        app.prometheus_address,
        app.listen_address,
        router,
    )
    .await
}

/// Like `tokio::spawn` but the provided future is modified so that
/// once it terminates it sends a message on the provided channel.
/// This is sent regardless of how the future terminates, as long as it
/// terminates normally (i.e., does not panic).
pub fn spawn_cancel<T>(
    died_sender: tokio::sync::broadcast::Sender<()>,
    future: T,
) -> tokio::task::JoinHandle<T::Output>
where
    T: futures::Future + Send + 'static,
    T::Output: Send + 'static,
{
    tokio::spawn(async move {
        let res = future.await;
        // We ignore errors here since this always happens at the end of a task.
        // Since we keep one receiver alive until the end of the `main` function
        // the error should not happen anyhow.
        let _ = died_sender.send(());
        res
    })
}

async fn start_services(
    issuer_worker: IssuerWorker,
    metric_handle: PrometheusHandle,
    prometheus_address: Option<SocketAddr>,
    listen_address: SocketAddr,
    router: Router,
) -> anyhow::Result<()> {
    // If a service crashes it will send a message on this channel, which will then
    // cause all of the other services to shut down.
    let (died_sender, died_receiver) = tokio::sync::broadcast::channel(10);
    // We create additional receivers of the broadcast messages.
    // We do this before any message is potentially sent to make sure all receivers
    // will receive them.
    let prometheus_receiver = died_sender.subscribe();
    let server_receiver = died_sender.subscribe();

    {
        let died_sender = died_sender.clone();
        // Start handling of shutdown signals now, before starting the server.
        let shutdown_signal = set_shutdown()?;
        tokio::spawn(async move {
            shutdown_signal.await;
            if died_sender.send(()).is_err() {
                tracing::error!("Unable to notify shutdown.");
            }
        });
    }

    if let Some(prometheus_address) = prometheus_address {
        let prometheus_api = axum::Router::new()
            .route(
                "/metrics",
                axum::routing::get(|| async move { metric_handle.render() }),
            )
            .layer(tower_http::timeout::TimeoutLayer::new(
                std::time::Duration::from_millis(1000),
            ))
            .layer(tower_http::limit::RequestBodyLimitLayer::new(0));
        tracing::info!("Starting prometheus server at {prometheus_address}.");
        spawn_cancel(died_sender.clone(), async move {
            axum::Server::bind(&prometheus_address)
                .serve(prometheus_api.into_make_service())
                .with_graceful_shutdown(shutdown_trigger(prometheus_receiver))
                .await
                .context("Unable to start Prometheus server.")?;
            Ok::<(), anyhow::Error>(())
        });
    }

    let transaction_sender = spawn_cancel(died_sender.clone(), issuer_worker.tx_sender());

    let server_handle = spawn_cancel(
        died_sender.clone(),
        axum::Server::bind(&listen_address)
            .http1_header_read_timeout(std::time::Duration::from_secs(5))
            .serve(router.into_make_service())
            .with_graceful_shutdown(shutdown_trigger(server_receiver)),
    );

    // Wait until something triggers shutdown. Either a signal handler or an error
    // in the service startup or transaction sender.
    shutdown_trigger(died_receiver).await;
    tracing::info!("Received shutdown trigger.");

    // Wait for the server to shut down itself. However this might not happen since
    // open connections can make it wait until the client drops them.
    // Thus we wait for 5s only, which should be sufficient to handle any
    // outstanding requests. After that we forcefully kill it.
    let res = tokio::time::timeout(std::time::Duration::from_secs(5), server_handle).await;

    if res.is_err() {
        tracing::error!(
            "Unable to stop the server gracefully in required time. Terminating forcefully."
        )
    }
    // Abort the sender explicitly. Since the server is now not responding even if
    // there are any pending transactions there is no point in sending them/waiting
    // for them to be sent.
    // This would happen implicitly as well, so this is here just for documentation.
    transaction_sender.abort();

    Ok(())
}

async fn shutdown_trigger(mut receiver: tokio::sync::broadcast::Receiver<()>) {
    if receiver.recv().await.is_err() {
        tracing::error!("Shutdown channel unexpectedly closed.");
    }
}

/// Construct a future for shutdown signals (for unix: SIGINT and SIGTERM) (for
/// windows: ctrl c and ctrl break). The signal handler is set when the future
/// is polled and until then the default signal handler.
fn set_shutdown() -> anyhow::Result<impl Future<Output = ()>> {
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
