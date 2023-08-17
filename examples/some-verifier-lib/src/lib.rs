use std::fmt::{self, Display, Formatter};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
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

#[derive(Serialize, Deserialize)]
pub struct Verification {
    pub platform: Platform,
    pub username: String,
    pub revoked: bool,
}
