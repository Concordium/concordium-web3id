use concordium_rust_sdk::contract_client::CredentialStatus;
use serde::{Deserialize, Serialize};
use std::fmt::{self, Display, Formatter};

/// Represents a social media platform.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Telegram,
    Discord,
}

impl Platform {
    pub const SUPPORTED_PLATFORMS: [Self; 2] = [Self::Telegram, Self::Discord];
}

impl Display for Platform {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        match self {
            Self::Telegram => write!(f, "Telegram"),
            Self::Discord => write!(f, "Discord"),
        }
    }
}

/// A social media account on a platform. A list of `Account`s
/// is sent as part of the verification API served by the some-verifier.
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub platform:    Platform,
    pub username:    String,
    pub cred_status: CredentialStatus,
}

/// A full name from a Concordium identity.
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FullName {
    pub first_name: String,
    pub last_name:  String,
}

impl Display for FullName {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "{} {}", self.first_name, self.last_name)
    }
}

/// A "verification" of a user. This type includes all confirmed
/// accounts of a user and, optinally, their full name.
#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub accounts:  Vec<Account>,
    pub full_name: Option<FullName>,
}
