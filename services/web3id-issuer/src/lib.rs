use concordium_rust_sdk::{web3id::{did::Method, Web3IdAttribute}, contract_client::MetadataUrl};
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
    pub metadata_url: MetadataUrl
}
