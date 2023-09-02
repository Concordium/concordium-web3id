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
use reqwest::{StatusCode, Url};
use serde::Serialize;
use std::{collections::BTreeMap, sync::Arc};

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
            Err(err) => {
                tracing::error!("Failed to register credential: {err}");
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }

    pub async fn register_credential(
        mut self,
        credential: &CredentialInfo,
        user_id: String,
        username: String,
    ) -> anyhow::Result<IssueResponse> {
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
