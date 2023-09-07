use anyhow::Context;
use axum::Json;
use axum_sessions::async_session::chrono::{self, TimeZone};
use concordium_rust_sdk::{
    cis4::{Cis4Contract, Cis4TransactionMetadata},
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
use priority_queue::PriorityQueue;
use reqwest::{StatusCode, Url};
use serde::Serialize;
use std::{
    cmp::Reverse,
    collections::{BTreeMap, HashMap},
    sync::Arc,
};

#[derive(Clone)]
pub struct IssuerState {
    pub crypto_params:         Arc<CryptographicParameters>,
    pub contract_client:       Cis4Contract,
    pub network:               Network,
    pub issuer:                Arc<WalletAccount>,
    pub issuer_key:            Arc<KeyPair>,
    pub credential_type:       CredentialType,
    pub nonce_counter:         Arc<tokio::sync::Mutex<Nonce>>,
    pub max_register_energy:   Energy,
    pub metadata_url:          Arc<Url>,
    pub credential_schema_url: Arc<str>,
    pub rate_limiter:          Arc<tokio::sync::Mutex<RateLimiter>>,
}

/// Remembers user ids of issued credentials up to a fixed capacity and how many
/// times credentials have been issued for the same ids.
pub struct RateLimiter {
    /// A counter that is incremented for each new credential giving them a
    /// priority.
    next_priority:  u64,
    /// Remembers user ids of recently issued credentials and orders them by
    /// recency.
    queue:          PriorityQueue<String, Reverse<u64>>,
    /// Stores how many times a given user id in `queue` has been issued.
    repeat_counts:  HashMap<String, usize>,
    queue_capacity: usize,
    max_repeats:    usize,
}

impl RateLimiter {
    pub fn new(queue_capacity: usize, max_repeats: usize) -> Self {
        Self {
            next_priority: 0,
            queue: PriorityQueue::new(),
            repeat_counts: HashMap::new(),
            queue_capacity,
            max_repeats,
        }
    }

    fn id_at_capacity(&self, id: &str) -> bool {
        let repeat_count = self.repeat_counts.get(id);
        repeat_count == Some(&self.max_repeats)
    }

    /// Insert an id into the rate limiter returning its old priority if it was
    /// already present.
    fn insert(&mut self, id: String) -> Option<u64> {
        // Insert in queue or update priority
        let old_priority = self
            .queue
            .push_decrease(id.clone(), Reverse(self.next_priority));
        self.next_priority += 1;

        // If the queue is now too big, remove an element
        if self.queue.len() > self.queue_capacity {
            let (removed, _) = self.queue.pop().unwrap();
            self.repeat_counts.remove(&removed);
        }

        // Increment in the repeats table
        self.repeat_counts
            .entry(id)
            .and_modify(|e| *e += 1)
            .or_insert(1);

        old_priority.map(|Reverse(p)| p)
    }

    fn undo_insert(&mut self, id: &str, old_priority: Option<u64>) {
        let count = match self.repeat_counts.get_mut(id) {
            Some(count) => count,
            None => return,
        };

        if *count == 1 {
            self.repeat_counts.remove(id);
            self.queue.remove(id);
        } else if let Some(p) = old_priority {
            *count -= 1;
            self.queue.change_priority(id, Reverse(p));
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    tx_hash:    TransactionHash,
    credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
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
        mut self,
        credential: &CredentialInfo,
        user_id: String,
        username: String,
    ) -> Result<Json<IssueResponse>, StatusCode> {
        tracing::debug!("Request to issue a credential.");

        if let Err(err) = self.validate_credential(credential) {
            tracing::warn!("Failed to validate credential: {err}");
            return Err(StatusCode::BAD_REQUEST);
        }

        let mut rate_limiter_guard = self.rate_limiter.lock().await;
        if rate_limiter_guard.id_at_capacity(&user_id) {
            tracing::info!("Rejecting credential due to rate limit.");
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        // Insert immediately so that we hold the lock for as short time as possible.
        // Additionally, IssueResponse does not implement Send, so it is not possible to
        // lock the rate_limiter after an IssueResponse has been created, since
        // otherwise we will hold a !Send across an await which means our handlers will
        // not implement axum::Handler.
        let old_priority = rate_limiter_guard.insert(user_id.clone());
        drop(rate_limiter_guard);

        // This awkward match circumvents https://github.com/rust-lang/rust/issues/104883
        let err = match self
            .register_credential(credential, user_id.clone(), username)
            .await
        {
            Ok(res) => {
                tracing::debug!(
                    "Successfully issued credential with id {}.",
                    credential.holder_id
                );
                return Ok(Json(res));
            }
            Err(err) => err,
        };

        self.rate_limiter
            .lock()
            .await
            .undo_insert(&user_id, old_priority);
        tracing::error!("Failed to register credential: {err}");
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }

    #[tracing::instrument(level = "debug", skip(self, credential))]
    async fn register_credential(
        &mut self,
        credential: &CredentialInfo,
        user_id: String,
        username: String,
    ) -> anyhow::Result<IssueResponse> {
        tracing::debug!("Registering a credential.");
        let mut nonce_guard = self.nonce_counter.lock().await;
        // Compute expiry after acquiring the lock to make sure we don't wait
        // too long before acquiring the lock, rendering expiry problematic
        let expiry = TransactionTime::minutes_after(5);
        tracing::debug!("Using nonce {} to send the transaction.", *nonce_guard);
        let metadata = Cis4TransactionMetadata {
            sender_address: self.issuer.address,
            nonce: *nonce_guard,
            expiry,
            energy: GivenEnergy::Add(self.max_register_energy),
            amount: Amount::zero(),
        };

        let tx_hash = self
            .contract_client
            .register_credential(&*self.issuer, &metadata, credential, &[])
            .await?;
        nonce_guard.next_mut();
        drop(nonce_guard);
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
    ) -> anyhow::Result<Web3IdCredential<ArCurve, Web3IdAttribute>> {
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
        .context("Incorrect number of values vs. randomness. This should not happen.")?;

        let valid_from = chrono::Utc
            .timestamp_millis_opt(credential.valid_from.timestamp_millis() as i64)
            .single()
            .context("Failed to convert valid_from time.")?;

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
