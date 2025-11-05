use axum::{Router, extract::rejection::JsonRejection, routing::post};
use concordium_rust_sdk::{cis4::CredentialStatus, id::constants::ArCurve, v2::BlockIdentifier, web3id::{self, Presentation, Web3IdAttribute}};

use crate::model::{Error, Response, State};

/// Presentation verification router
pub fn verify_presentation_router(state: State) -> anyhow::Result<Router> {
    Ok(
        Router::new()
            .route("/v0/verify", post(verify_presentation))
            .with_state(state)
    )
}

/// Verify presentation handler
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