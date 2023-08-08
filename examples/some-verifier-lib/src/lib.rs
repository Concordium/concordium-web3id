use std::fmt::{self, Display, Formatter};

use serde::{Deserialize, Serialize};

/// Represents a social media platform.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Platform {
    Telegram,
    Discord,
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
pub struct Account {
    pub platform: Platform,
    pub username: String,
    pub revoked: bool,
}

/// A full name from a Concordium identity.
#[derive(Serialize, Deserialize, Debug)]
pub struct FullName {
    pub first_name: String,
    pub last_name: String,
}

/// A "verification" of a user. This type includes all confirmed
/// accounts of a user and, optinally, their full name.
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct Verification {
    pub accounts: Vec<Account>,
    pub full_name: Option<FullName>,
}
