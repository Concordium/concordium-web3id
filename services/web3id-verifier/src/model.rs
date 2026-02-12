use std::sync::Arc;

use axum::{extract::rejection::JsonRejection, http::StatusCode};
use concordium_rust_sdk::{base::{hashes::BlockHash, web3id}, id::{constants::ArCurve, types::GlobalContext}, v2, web3id::{CredentialLookupError, PresentationVerificationError, Web3IdAttribute, did::Network}};


#[derive(Debug, thiserror::Error)]
pub enum Error {
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
pub struct State {
    pub client: v2::Client,
    pub network: Network,
    pub params: Arc<GlobalContext<ArCurve>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub block: BlockHash,
    pub block_time: chrono::DateTime<chrono::Utc>,
    #[serde(flatten)]
    pub request: web3id::Request<ArCurve, Web3IdAttribute>,
}