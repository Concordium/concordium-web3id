use concordium_rust_sdk::{
    contract_client::MetadataUrl,
    id::constants::ArCurve,
    types::hashes::TransactionHash,
    web3id::{did::Method, Web3IdAttribute, Web3IdCredential},
};
use std::collections::BTreeMap;

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSubject {
    pub id:         Method,
    pub attributes: BTreeMap<String, Web3IdAttribute>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueRequest {
    pub valid_from:         chrono::DateTime<chrono::Utc>,
    pub valid_until:        Option<chrono::DateTime<chrono::Utc>>,
    pub holder_revocable:   bool,
    pub credential_subject: CredentialSubject,
    pub metadata_url:       MetadataUrl,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueResponse {
    pub tx_hash:    TransactionHash,
    pub credential: Web3IdCredential<ArCurve, Web3IdAttribute>,
}
