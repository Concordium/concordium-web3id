use axum::Json;
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
    web3id::{did::Network, SignedCommitments, Web3IdAttribute, Web3IdCredential},
};
use reqwest::{StatusCode, Url};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
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

#[derive(Clone)]
pub struct IssuerState {
    pub crypto_params:         Arc<CryptographicParameters>,
    pub contract_client:       Cis4Contract,
    pub network:               Network,
    pub issuer:                Arc<WalletAccount>,
    pub issuer_key:            Arc<KeyPair>,
    pub credential_type:       CredentialType,
    pub state:                 Arc<tokio::sync::Mutex<SyncState>>,
    pub max_register_energy:   Energy,
    pub metadata_url:          Arc<Url>,
    pub credential_schema_url: Arc<str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    tx_hash:    TransactionHash,
    credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
}

#[derive(thiserror::Error, Debug)]
pub enum RegisterCredentialError {
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

impl IssuerState {
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

    #[tracing::instrument(level = "debug", skip(self, credential))]
    pub async fn issue_credential(
        self,
        credential: &CredentialInfo,
        user_id: String,
        username: String,
    ) -> Result<Json<IssueResponse>, StatusCode> {
        tracing::debug!("Request to issue a credential.");

        if let Err(err) = self.validate_credential(credential) {
            tracing::warn!("Failed to validate credential: {err}");
            return Err(StatusCode::BAD_REQUEST);
        }

        match self
            .register_credential(credential, user_id, username)
            .await
        {
            Ok(res) => {
                tracing::debug!(
                    "Successfully issued credential with id {}.",
                    credential.holder_id
                );
                Ok(Json(res))
            }
            Err(RegisterCredentialError::LimitExceeded { user_id }) => {
                tracing::info!("Rejecting credential for user id {user_id} due to rate limit.");
                Err(StatusCode::TOO_MANY_REQUESTS)
            }
            Err(err) => {
                tracing::error!("Failed to register credential: {err}");
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }

    #[tracing::instrument(level = "debug", skip(self, credential))]
    pub async fn register_credential(
        mut self,
        credential: &CredentialInfo,
        user_id: String,
        username: String,
    ) -> Result<IssueResponse, RegisterCredentialError> {
        tracing::debug!("Registering a credential.");
        let mut state_guard = self.state.lock().await;
        if !state_guard.limit.check_limit(user_id.as_str()) {
            return Err(RegisterCredentialError::LimitExceeded { user_id });
        }
        // Compute expiry after acquiring the lock to make sure we don't wait
        // too long before acquiring the lock, rendering expiry problematic
        let expiry = TransactionTime::minutes_after(5);
        tracing::debug!("Using nonce {} to send the transaction.", state_guard.nonce);
        let metadata = Cis4TransactionMetadata {
            sender_address: self.issuer.address,
            nonce: state_guard.nonce,
            expiry,
            energy: GivenEnergy::Add(self.max_register_energy),
            amount: Amount::zero(),
        };

        let tx_hash = self
            .contract_client
            .register_credential(&*self.issuer, &metadata, credential, &[])
            .await?;
        state_guard.nonce.next_mut();
        state_guard.limit.update_limit(user_id.as_str());
        drop(state_guard);
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
        let credential = self.make_secrets(values, credential)?;

        Ok(IssueResponse {
            tx_hash,
            credential,
        })
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
pub fn set_shutdown() -> anyhow::Result<impl futures::Future<Output = ()>> {
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
