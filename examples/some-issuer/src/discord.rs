use std::collections::HashMap;

use axum::extract::{Query, State};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use serde::{Deserialize, Serialize};

use crate::AppState;

pub async fn handle_oauth<B>(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    request: Request<B>,
    next: Next<B>,
) -> Response {
    if let Some(code) = params.get("code") {
        match get_user(state, code).await {
            Ok(user) => {
                // TODO: Issue credential for user
                tracing::info!("{user:?}");
            }
            Err(err) => {
                tracing::error!("Error getting Discord user: {err}");
            }
        }
    }

    next.run(request).await
}

#[derive(Deserialize, Debug)]
struct User {
    id: String,
    username: String,
    discriminator: String,
}

#[derive(Serialize)]
struct AccessTokenRequestData<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    grant_type: &'static str,
    code: &'a str,
    redirect_uri: &'a str,
}

#[derive(Deserialize)]
#[allow(unused)]
struct AccessTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u32,
    refresh_token: String,
    scope: String,
}

async fn get_user(state: AppState, code: &str) -> anyhow::Result<User> {
    const API_ENDPOINT: &'static str = "https://discord.com/api/v10";
    let data = AccessTokenRequestData {
        client_id: &*state.discord_client_id,
        client_secret: &*state.discord_client_secret,
        grant_type: "authorization_code",
        code,
        redirect_uri: state.dapp_url.as_str(),
    };

    let response = state
        .client
        .post(format!("{API_ENDPOINT}/oauth2/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_urlencoded::to_string(data).unwrap())
        .send()
        .await?;
    anyhow::ensure!(
        response.status().is_success(),
        "user authetication failed: {}",
        response.text().await?
    );

    let response: AccessTokenResponse = serde_json::from_slice(&response.bytes().await?)?;
    anyhow::ensure!(
        response.token_type == "Bearer",
        "expected Bearer token, got '{}'",
        response.token_type
    );
    anyhow::ensure!(
        response.scope == "identify",
        "expected 'idenitfy' scope, got '{}'",
        response.scope
    );

    let response = state
        .client
        .get(format!("{API_ENDPOINT}/users/@me"))
        .bearer_auth(response.access_token)
        .send()
        .await?;
    Ok(serde_json::from_slice(&response.bytes().await?)?)
}
