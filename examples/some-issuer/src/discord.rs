use std::collections::HashMap;

use axum::extract::{Query, State};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Redirect, Response};
use axum_sessions::extractors::WritableSession;
use serde::{Deserialize, Serialize};

use crate::AppState;

pub async fn handle_oauth<B>(
    State(state): State<AppState>,
    Query(mut params): Query<HashMap<String, String>>,
    mut session: WritableSession,
    request: Request<B>,
    next: Next<B>,
) -> Response {
    if let Some(code) = params.get("code") {
        match get_user(state, code).await {
            Ok(user) => {
                session
                    .insert("discord_id", &user.id)
                    .expect("user ids can be serialized");
                params.insert("discordId".into(), user.id);
                params.remove("code");
                let request_uri = request.uri().to_string();
                let base_uri = request_uri
                    .split_once('?')
                    .expect("request uri has a query string")
                    .0;
                let query = serde_urlencoded::to_string(params).expect("query can be URL encoded");
                return Redirect::to(&format!("{base_uri}?{query}")).into_response();
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
    let redirect_uri = state.dapp_url.join("discord-oauth2").unwrap();
    let data = AccessTokenRequestData {
        client_id: &*state.discord_client_id,
        client_secret: &*state.discord_client_secret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect_uri.as_str(),
    };

    let response = state
        .http_client
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
        .http_client
        .get(format!("{API_ENDPOINT}/users/@me"))
        .bearer_auth(response.access_token)
        .send()
        .await?;
    Ok(serde_json::from_slice(&response.bytes().await?)?)
}
