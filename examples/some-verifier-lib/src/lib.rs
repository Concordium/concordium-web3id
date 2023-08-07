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

#[derive(Serialize, Deserialize)]
pub enum Verification {
    Platform {
        platform: Platform,
        username: String,
        revoked: bool,
    },
    Name {
        first_name: String,
        last_name: String,
    },
}
