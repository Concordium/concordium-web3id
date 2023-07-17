use std::fmt::{self, Display};

use axum::extract::State;
use axum::Json;
use hmac::{Hmac, Mac};
use reqwest::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::AppState;

#[derive(Deserialize, Debug)]
pub struct User {
    id: u64,
    first_name: String,
    last_name: Option<String>,
    username: Option<String>,
    photo_url: Option<String>,
    auth_date: u64,
    hash: String,
}

/// Note: the exact format of this is important, as it is used for verification.
/// See https://core.telegram.org/widgets/login
impl Display for User {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        writeln!(f, "auth_date={}", self.auth_date)?;
        writeln!(f, "first_name={}", self.first_name)?;
        write!(f, "id={}", self.id)?;
        if let Some(last_name) = &self.last_name {
            write!(f, "\nlast_name={last_name}")?;
        }
        if let Some(photo_url) = &self.photo_url {
            write!(f, "\nphoto_url={photo_url}")?;
        }
        if let Some(username) = &self.username {
            write!(f, "\nusername={username}")?;
        }
        Ok(())
    }
}

pub async fn handle_auth(State(state): State<AppState>, Json(user): Json<User>) -> StatusCode {
    match check_user(&user, &state.telegram_bot_token) {
        Ok(()) => {
            // TODO: Issue credential for user
            tracing::info!("{user}");
            StatusCode::OK
        }
        Err(err) => {
            tracing::error!("Error checking Telegram user: {err}");
            StatusCode::BAD_REQUEST
        }
    }
}

type HmacSha256 = Hmac<Sha256>;
fn check_user(user: &User, telegram_bot_token: &str) -> anyhow::Result<()> {
    let mut hasher = Sha256::new();
    hasher.update(telegram_bot_token);
    let key = hasher.finalize();

    let mut mac = HmacSha256::new_from_slice(&key).unwrap();
    mac.update(user.to_string().as_bytes());

    let mac_bytes = mac.finalize().into_bytes();
    let expected = hex::decode(&user.hash)?;

    anyhow::ensure!(&mac_bytes[..] == &expected[..], "MAC did not match hash.");
    Ok(())
}
