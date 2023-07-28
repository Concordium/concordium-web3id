use std::collections::BTreeMap;

use anyhow::Context;
use axum::extract::State;
use axum::Json;
use axum_sessions::async_session::chrono;
use axum_sessions::extractors::ReadableSession;
use concordium_rust_sdk::cis4::Cis4TransactionMetadata;
use concordium_rust_sdk::common::types::TransactionTime;
use concordium_rust_sdk::contract_client::CredentialInfo;
use concordium_rust_sdk::id::constants::{ArCurve, AttributeKind};
use concordium_rust_sdk::id::pedersen_commitment;
use concordium_rust_sdk::smart_contracts::common::{Amount, Duration, Timestamp};
use concordium_rust_sdk::types::hashes::TransactionHash;
use concordium_rust_sdk::types::transactions::send::GivenEnergy;
use concordium_rust_sdk::web3id::{SignedCommitments, Web3IdAttribute, Web3IdCredential};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::telegram::{self, check_user};
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueRequest {
    credential: CredentialInfo,
    values: BTreeMap<u8, Web3IdAttribute>,
    // Telegram authentication happens in a single request that includes a user object
    telegram_user: Option<telegram::User>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    tx_hash: TransactionHash,
    credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
}

#[tracing::instrument(level = "info", skip(state, session, request))]
pub async fn issue_credential(
    State(state): State<AppState>,
    session: ReadableSession,
    Json(request): Json<IssueRequest>,
) -> Result<Json<IssueResponse>, StatusCode> {
    tracing::info!("Request to issue a credential.");

    if let Err(err) = validate_credential(&state, session, &request) {
        tracing::warn!("Failed to validate credential: {err}");
        return Err(StatusCode::BAD_REQUEST);
    }

    match register_credential(state, request).await {
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

fn validate_credential(
    state: &AppState,
    session: ReadableSession,
    request: &IssueRequest,
) -> anyhow::Result<()> {
    // Check that supplied user id is autheticated and matches supplied platform
    let user_id = match request.values.get(&0) {
        Some(Web3IdAttribute::String(AttributeKind(attr))) if attr == "Telegram" => {
            let user = request
                .telegram_user
                .as_ref()
                .context("Missing user in Telegram request.")?;
            check_user(&user, &state.telegram_bot_token)?;
            user.id.to_string()
        }
        Some(Web3IdAttribute::String(AttributeKind(attr))) if attr == "Discord" => session
            .get("discord_id")
            .context("Missing session user id for Discord request.")?,
        _ => anyhow::bail!("Wrong platform attribute."),
    };
    match request.values.get(&1) {
        Some(Web3IdAttribute::String(AttributeKind(attr))) if attr == &user_id => {}
        _ => anyhow::bail!("Wrong user id attribute"),
    }

    // Check that the credential itself is reasonable
    anyhow::ensure!(
        request.credential.holder_revocable,
        "Credential should be holder revocable."
    );
    let now = chrono::Utc::now().timestamp_millis();
    let delta = Timestamp::from_timestamp_millis(now as u64)
        .duration_between(request.credential.valid_from);
    anyhow::ensure!(
        delta < Duration::from_minutes(1),
        "Credential should start now."
    );
    anyhow::ensure!(
        request.credential.valid_until.is_none(),
        "Credential should not expire."
    );
    let metadata_url = state
        .dapp_url
        .join("json-schemas/credential-metadata.json")
        .unwrap();
    anyhow::ensure!(
        request.credential.metadata_url.url() == metadata_url.as_str(),
        "Metadata URL should be correct."
    );

    Ok(())
}

async fn register_credential(
    mut state: AppState,
    request: IssueRequest,
) -> anyhow::Result<IssueResponse> {
    let mut nonce_guard = state.nonce_counter.lock().await;
    // compute expiry after acquiring the lock to make sure we don't wait
    // too long before acquiring the lock, rendering expiry problematic.
    let expiry = TransactionTime::minutes_after(5);
    tracing::info!("Using nonce {} to send the transaction.", *nonce_guard);
    let metadata = Cis4TransactionMetadata {
        sender_address: state.issuer.address,
        nonce: *nonce_guard,
        expiry,
        energy: GivenEnergy::Add(state.max_register_energy),
        amount: Amount::zero(),
    };

    let tx_hash = state
        .contract_client
        .register_credential(&*state.issuer, &metadata, &request.credential, &[])
        .await?;
    nonce_guard.next_mut();
    drop(nonce_guard);
    let credential = make_secrets(&state, request.values, &request.credential)?;

    Ok(IssueResponse {
        tx_hash,
        credential,
    })
}

fn make_secrets(
    state: &AppState,
    values: BTreeMap<u8, Web3IdAttribute>,
    credential: &CredentialInfo,
) -> anyhow::Result<Web3IdCredential<ArCurve, Web3IdAttribute>> {
    let mut randomness = BTreeMap::new();
    {
        let mut rng = rand::thread_rng();
        for idx in values.keys() {
            randomness.insert(*idx, pedersen_commitment::Randomness::generate(&mut rng));
        }
    }

    let signed_commitments = SignedCommitments::from_secrets(
        &state.crypto_params,
        &values,
        &randomness,
        &credential.holder_id,
        state.issuer_key.as_ref(),
    )
    .context("Incorrect number of values vs. randomness. This should not happen.")?;

    Ok(Web3IdCredential {
        issuance_date: chrono::Utc::now(),
        registry: state.contract_client.address,
        issuer_key: state.issuer_key.public.into(),
        values,
        randomness,
        signature: signed_commitments.signature,
        holder_id: credential.holder_id,
    })
}
