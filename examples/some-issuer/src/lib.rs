use anyhow::Context;
use axum::Router;
use axum_prometheus::metrics_exporter_prometheus::PrometheusHandle;
use axum_sessions::async_session::chrono::{self, TimeZone};
use concordium_rust_sdk::{
    cis4::{Cis4Contract, Cis4TransactionError, Cis4TransactionMetadata},
    common::types::{KeyPair, TransactionTime},
    contract_client::{CredentialInfo, CredentialType},
    id::{
        constants::{ArCurve, AttributeKind},
        pedersen_commitment,
    },
    smart_contracts::common::{Amount, Duration, Timestamp},
    types::{
        hashes::TransactionHash, transactions::send::GivenEnergy, CryptographicParameters, Energy,
        Nonce, WalletAccount,
    },
    v2::RPCError,
    web3id::{did::Network, SignedCommitments, Web3IdAttribute, Web3IdCredential},
};
use reqwest::{StatusCode, Url};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    net::SocketAddr,
    sync::Arc,
};

pub struct SyncState {
    nonce: Nonce,
    limit: RateLimiter,
}

struct RateLimiter {
    multiplicity:   usize,
    max_queue_size: usize,
    queue:          VecDeque<Arc<str>>,
    mapping:        HashMap<Arc<str>, usize>,
}

impl RateLimiter {
    pub fn check_limit(&self, new: &str) -> bool {
        let multiplicity = self.mapping.get(new).unwrap_or(&0);
        *multiplicity < self.multiplicity
    }

    pub fn update_limit(&mut self, new: &str) {
        let new = Arc::from(new);
        let multiplicity = self.mapping.entry(Arc::clone(&new)).or_insert(0);
        *multiplicity += 1;
        if self.queue.len() >= self.max_queue_size {
            if let Some(last) = self.queue.pop_back() {
                if let Some(occupied) = self.mapping.get_mut(&last) {
                    *occupied -= 1;
                    if *occupied == 0 {
                        self.mapping.remove(&last);
                    }
                }
            }
        };
        self.queue.push_front(new);
    }
}

impl SyncState {
    pub fn new(nonce: Nonce, max_queue_size: usize, multiplicity: usize) -> Self {
        Self {
            nonce,
            limit: RateLimiter {
                queue: VecDeque::new(),
                mapping: HashMap::new(),
                multiplicity,
                max_queue_size,
            },
        }
    }
}

/// Data sent on a channel from the request handler task to the transaction
/// sender task.
#[derive(Debug)]
pub struct IssueChannelData {
    pub credential:      CredentialInfo,
    pub user_id:         String,
    pub username:        String,
    /// The channel where the response is sent. The type that is sent is
    /// [`IssueResponse`], however that type is not [`Send`] so we serialize it
    /// to a JSON value in the worker thread instead.
    pub response_sender: tokio::sync::oneshot::Sender<Result<serde_json::Value, StatusCode>>,
}

pub struct IssuerWorker {
    pub crypto_params:         Arc<CryptographicParameters>,
    pub contract_client:       Cis4Contract,
    pub network:               Network,
    pub issuer:                Arc<WalletAccount>,
    pub issuer_key:            Arc<KeyPair>,
    pub credential_type:       CredentialType,
    pub state:                 SyncState,
    pub max_register_energy:   Energy,
    pub metadata_url:          Arc<Url>,
    pub credential_schema_url: Arc<str>,
    /// A channel where new issue requests will be given.
    pub receiver:              tokio::sync::mpsc::Receiver<IssueChannelData>,
}

fn send_and_log<T>(sender: tokio::sync::oneshot::Sender<T>, msg: T) {
    if sender.send(msg).is_err() {
        tracing::warn!("Unabled to send response. The request has been cancelled.");
    }
}

impl IssuerWorker {
    /// A transaction sender job. This listens for incoming issue requests and
    /// sends transactions to the chain.
    ///
    /// This is intended to be run in a background task that is started once.
    /// The task is not cancel-safe in the sense that if it is cancelled, the
    /// state of [`IssuerWorker`] might be inconsistent. This is why this
    /// function consumes [`Self`].
    #[tracing::instrument(level = "debug", skip_all)]
    async fn tx_sender(mut self) {
        while let Some(IssueChannelData {
            credential,
            user_id,
            username,
            response_sender,
        }) = self.receiver.recv().await
        {
            if let Err(err) = self.validate_credential(&credential) {
                tracing::warn!("Failed to validate credential: {err}");
                send_and_log(response_sender, Err(StatusCode::BAD_REQUEST));
                continue;
            }

            let tx_hash = match self
                .register_credential(&credential, user_id.as_str(), username.as_str())
                .await
            {
                Ok(tx_hash) => {
                    tracing::debug!(
                        "Successfully registered credential with id {} (tx {tx_hash}).",
                        credential.holder_id
                    );
                    tx_hash
                }
                Err(RegisterCredentialError::LimitExceeded { user_id }) => {
                    tracing::info!("Rejecting credential for user id {user_id} due to rate limit.");
                    send_and_log(response_sender, Err(StatusCode::TOO_MANY_REQUESTS));
                    continue;
                }
                Err(RegisterCredentialError::Chain(Cis4TransactionError::RPCError(
                    RPCError::CallError(err),
                ))) if err.code() == tonic::Code::InvalidArgument => {
                    tracing::error!(
                        "Transaction rejected by the node: {err}
                         Assuming account sequence number is incorrect, or some other \
                         inconsistency, and terminating."
                    );
                    send_and_log(response_sender, Err(StatusCode::INTERNAL_SERVER_ERROR));
                    break;
                }
                Err(RegisterCredentialError::Chain(Cis4TransactionError::NodeRejected(rr))) => {
                    tracing::warn!("Bad request rejected by the contract: {rr:?}");
                    send_and_log(response_sender, Err(StatusCode::BAD_REQUEST));
                    continue;
                }
                Err(RegisterCredentialError::Chain(other_err)) => {
                    tracing::error!("Failed to register credential: {other_err}");
                    send_and_log(response_sender, Err(StatusCode::BAD_GATEWAY));
                    continue;
                }
                Err(err) => {
                    tracing::error!("Failed to register credential: {err}");
                    send_and_log(response_sender, Err(StatusCode::INTERNAL_SERVER_ERROR));
                    continue;
                }
            };
            let values: BTreeMap<_, _> = BTreeMap::from([
                (
                    String::from("userId"),
                    Web3IdAttribute::String(AttributeKind(user_id)),
                ),
                (
                    String::from("username"),
                    Web3IdAttribute::String(AttributeKind(username)),
                ),
            ]);
            let credential = match self.make_secrets(values, &credential) {
                Ok(credential) => credential,
                Err(e) => {
                    tracing::error!("Unable to create secrets: {e}");
                    send_and_log(response_sender, Err(StatusCode::INTERNAL_SERVER_ERROR));
                    return;
                }
            };
            let response = IssueResponse {
                tx_hash,
                credential,
            };
            send_and_log(
                response_sender,
                Ok(serde_json::to_value(&response)
                    .expect("Serialization of web3id credentials does not fail.")),
            );
        }
        // All senders of the channel have been dropped.
        tracing::info!("The transaction sender was stopped.");
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    tx_hash:    TransactionHash,
    credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
}

#[derive(thiserror::Error, Debug)]
pub enum RegisterCredentialError {
    #[error("Credential is not valid.")]
    InvalidCredential,
    #[error("Limit of credentials for id {user_id} exceeded.")]
    LimitExceeded { user_id: String },
    #[error("Error sending transaction: {0}")]
    Chain(#[from] Cis4TransactionError),
    #[error("Internal issue error: {0}")]
    Internal(#[from] MakeSecretsError),
}

#[derive(thiserror::Error, Debug)]
pub enum MakeSecretsError {
    #[error("Incompatible number of values and randomness: {values} != {randomness}.")]
    IncompatibleValuesAndRandomness {
        values:     usize,
        randomness: usize,
    },
    #[error("Invalid timestamp.")]
    InvalidTimestamp,
}

impl IssuerWorker {
    /// Checks that the credential is reasonable.
    fn validate_credential(&self, credential: &CredentialInfo) -> anyhow::Result<()> {
        anyhow::ensure!(
            credential.holder_revocable,
            "Credential should be holder revocable."
        );
        let now = chrono::Utc::now().timestamp_millis();
        let delta =
            Timestamp::from_timestamp_millis(now as u64).duration_between(credential.valid_from);
        anyhow::ensure!(
            delta < Duration::from_minutes(1),
            "Credential should start now."
        );
        anyhow::ensure!(
            credential.valid_until.is_none(),
            "Credential should not expire."
        );
        anyhow::ensure!(
            credential.metadata_url.url() == self.metadata_url.as_str(),
            "Metadata URL should be correct."
        );

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self, credential), fields(holder_id = %credential.holder_id))]
    pub async fn register_credential(
        &mut self,
        credential: &CredentialInfo,
        user_id: &str,
        username: &str,
    ) -> Result<TransactionHash, RegisterCredentialError> {
        tracing::debug!("Registering a credential.");
        if !self.state.limit.check_limit(user_id) {
            return Err(RegisterCredentialError::LimitExceeded {
                user_id: user_id.into(),
            });
        }
        // Compute expiry after acquiring the lock to make sure we don't wait
        // too long before acquiring the lock, rendering expiry problematic
        let expiry = TransactionTime::minutes_after(5);
        tracing::debug!("Using nonce {} to send the transaction.", self.state.nonce);
        let metadata = Cis4TransactionMetadata {
            sender_address: self.issuer.address,
            nonce: self.state.nonce,
            expiry,
            energy: GivenEnergy::Add(self.max_register_energy),
            amount: Amount::zero(),
        };

        let tx_hash = self
            .contract_client
            .register_credential(&*self.issuer, &metadata, credential, &[])
            .await?;
        self.state.nonce.next_mut();
        self.state.limit.update_limit(user_id);
        Ok(tx_hash)
    }

    fn make_secrets(
        &self,
        values: BTreeMap<String, Web3IdAttribute>,
        credential: &CredentialInfo,
    ) -> Result<Web3IdCredential<ArCurve, Web3IdAttribute>, MakeSecretsError> {
        let mut randomness = BTreeMap::new();
        {
            let mut rng = rand::thread_rng();
            for idx in values.keys() {
                randomness.insert(
                    idx.clone(),
                    pedersen_commitment::Randomness::generate(&mut rng),
                );
            }
        }

        let signed_commitments = SignedCommitments::from_secrets(
            &self.crypto_params,
            &values,
            &randomness,
            &credential.holder_id,
            self.issuer_key.as_ref(),
            self.contract_client.address,
        )
        .ok_or(MakeSecretsError::IncompatibleValuesAndRandomness {
            values:     values.len(),
            randomness: randomness.len(),
        })?;

        let valid_from = chrono::Utc
            .timestamp_millis_opt(credential.valid_from.timestamp_millis() as i64)
            .single()
            .ok_or(MakeSecretsError::InvalidTimestamp)?;

        Ok(Web3IdCredential {
            holder_id: credential.holder_id,
            network: self.network,
            registry: self.contract_client.address,
            credential_type: [
                String::from("VerifiableCredential"),
                String::from("ConcordiumVerifiableCredential"),
                self.credential_type.credential_type.clone(),
            ]
            .into(),
            valid_from,
            valid_until: None,
            issuer_key: self.issuer_key.public.into(),
            values,
            randomness,
            signature: signed_commitments.signature,
            credential_schema: self.credential_schema_url.to_string(),
        })
    }
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
    T::Output: Send + 'static, {
    tokio::spawn(async move {
        let res = future.await;
        // We ignore errors here since this always happens at the end of a task.
        // Since we keep one receiver alive until the end of the `main` function
        // the error should not happen anyhow.
        let _ = died_sender.send(());
        res
    })
}

pub async fn start_services(
    issuer_state: IssuerWorker,
    metric_handle: PrometheusHandle,
    prometheus_address: Option<SocketAddr>,
    listen_address: SocketAddr,
    router: Router,
) -> anyhow::Result<()> {
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

    let transaction_sender = spawn_cancel(died_sender.clone(), issuer_state.tx_sender());

    tracing::info!("Starting server on {}...", listen_address);
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

#[tracing::instrument(level = "debug", skip_all, fields(holder_id = %credential.holder_id))]
pub async fn send_tx(
    credential: CredentialInfo,
    user_id: String,
    username: String,
    sender: &tokio::sync::mpsc::Sender<IssueChannelData>,
) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    let (response_sender, response_receiver) = tokio::sync::oneshot::channel();
    let data = IssueChannelData {
        credential,
        user_id,
        username,
        response_sender,
    };
    if sender.send(data).await.is_err() {
        tracing::error!("Failed enqueueing transaction. The transaction sender task died.");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    if let Ok(r) = response_receiver.await {
        r.map(axum::Json)
    } else {
        // There is no information in the error.
        tracing::error!(
            "Failed sending transaction; did not get response from transaction sender."
        );
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }
}
