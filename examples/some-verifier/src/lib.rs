use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy)]
pub enum Platform {
    Telegram,
    Discord,
}

#[derive(Serialize, Deserialize)]
pub struct Verification {
    pub platform: Platform,
    pub username: String,
    pub revoked: bool,
}
