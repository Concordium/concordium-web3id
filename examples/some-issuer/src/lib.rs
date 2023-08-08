use std::collections::BTreeMap;
use std::sync::Arc;

use anyhow::Context;
use axum::Json;
use axum_sessions::async_session::chrono::{self, TimeZone};
use concordium_rust_sdk::cis4::{Cis4Contract, Cis4TransactionMetadata};
use concordium_rust_sdk::common::types::{KeyPair, TransactionTime};
use concordium_rust_sdk::contract_client::CredentialInfo;
use concordium_rust_sdk::id::constants::{ArCurve, AttributeKind};
use concordium_rust_sdk::id::pedersen_commitment;
use concordium_rust_sdk::smart_contracts::common::{Amount, Duration, Timestamp};
use concordium_rust_sdk::types::hashes::TransactionHash;
use concordium_rust_sdk::types::transactions::send::GivenEnergy;
use concordium_rust_sdk::types::{CryptographicParameters, Energy, Nonce, WalletAccount};
use concordium_rust_sdk::web3id::did::Network;
use concordium_rust_sdk::web3id::{SignedCommitments, Web3IdAttribute, Web3IdCredential};
use reqwest::{StatusCode, Url};
use serde::Serialize;

#[derive(Clone)]
pub struct IssuerState {
    pub crypto_params: Arc<CryptographicParameters>,
    pub contract_client: Cis4Contract,
    pub network: Network,
    pub issuer: Arc<WalletAccount>,
    pub issuer_key: Arc<KeyPair>,
    pub nonce_counter: Arc<tokio::sync::Mutex<Nonce>>,
    pub max_register_energy: Energy,
    pub metadata_url: Arc<Url>,
    pub credential_schema_url: Arc<Url>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    tx_hash: TransactionHash,
    credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
}

#[tracing::instrument(level = "info", skip(issuer, credential, user_id))]
pub async fn issue_credential(
    issuer: IssuerState,
    credential: CredentialInfo,
    user_id: String,
) -> Result<Json<IssueResponse>, StatusCode> {
    tracing::info!("Request to issue a credential.");

    if let Err(err) = validate_credential(&issuer, &credential) {
        tracing::warn!("Failed to validate credential: {err}");
        return Err(StatusCode::BAD_REQUEST);
    }

    match register_credential(issuer, credential, user_id).await {
        Ok(res) => {
            tracing::info!("Successfully issued credential.");
            Ok(Json(res))
        }
        Err(err) => {
            tracing::error!("Failed to register credential: {err}");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Checks that the credential is reasonable.
fn validate_credential(issuer: &IssuerState, credential: &CredentialInfo) -> anyhow::Result<()> {
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
        credential.metadata_url.url() == issuer.metadata_url.as_str(),
        "Metadata URL should be correct."
    );

    Ok(())
}

async fn register_credential(
    mut issuer: IssuerState,
    credential: CredentialInfo,
    user_id: String,
) -> anyhow::Result<IssueResponse> {
    let mut nonce_guard = issuer.nonce_counter.lock().await;
    // Compute expiry after acquiring the lock to make sure we don't wait
    // too long before acquiring the lock, rendering expiry problematic
    let expiry = TransactionTime::minutes_after(5);
    tracing::info!("Using nonce {} to send the transaction.", *nonce_guard);
    let metadata = Cis4TransactionMetadata {
        sender_address: issuer.issuer.address,
        nonce: *nonce_guard,
        expiry,
        energy: GivenEnergy::Add(issuer.max_register_energy),
        amount: Amount::zero(),
    };

    let tx_hash = issuer
        .contract_client
        .register_credential(&*issuer.issuer, &metadata, &credential, &[])
        .await?;
    nonce_guard.next_mut();
    drop(nonce_guard);
    let values: BTreeMap<_, _> = BTreeMap::from([(
        String::from("userId"),
        Web3IdAttribute::String(AttributeKind(user_id)),
    )]);
    let credential = make_secrets(&issuer, values, &credential)?;

    Ok(IssueResponse {
        tx_hash,
        credential,
    })
}

fn make_secrets(
    issuer: &IssuerState,
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
        &issuer.crypto_params,
        &values,
        &randomness,
        &credential.holder_id,
        issuer.issuer_key.as_ref(),
        issuer.contract_client.address,
    )
    .context("Incorrect number of values vs. randomness. This should not happen.")?;

    let valid_from = chrono::Utc
        .timestamp_millis_opt(credential.valid_from.timestamp_millis() as i64)
        .single()
        .context("Failed to convert valid_from time.")?;

    Ok(Web3IdCredential {
        holder_id: credential.holder_id,
        network: issuer.network,
        registry: issuer.contract_client.address,
        credential_type: [
            String::from("VerifiableCredential"),
            String::from("ConcordiumVerifiableCredential"),
            String::from("TelegramCredential"),
        ]
        .into(),
        valid_from,
        valid_until: None,
        issuer_key: issuer.issuer_key.public.into(),
        values,
        randomness,
        signature: signed_commitments.signature,
        credential_schema: "todo!()".into(),
    })
}
