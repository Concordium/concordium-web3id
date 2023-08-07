use std::fmt::{self, Display, Formatter};

use serde::{Deserialize, Serialize};

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

#[derive(Serialize, Deserialize, Debug)]
pub struct Account {
    pub platform: Platform,
    pub username: String,
    pub revoked: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FullName {
    pub first_name: String,
    pub last_name: String,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct Verification {
    pub accounts: Vec<Account>,
    pub full_name: Option<FullName>,
}
