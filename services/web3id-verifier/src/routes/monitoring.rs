use axum::{Router, routing::get, extract::State, Json};
use axum::http::StatusCode;
use prometheus_client::registry::Registry;
use serde_json::json;
use std::sync::Arc;

#[derive(Clone)]
struct HealthState {}

async fn health(State(_): State<HealthState>) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

async fn metrics(State(registry): State<Arc<Registry>>) -> String {
    let mut buffer = String::new();
    prometheus_client::encoding::text::encode(&mut buffer, &registry).unwrap();
    buffer
}

pub fn monitoring_router(registry: Registry) -> anyhow::Result<Router> {
    Ok(
        Router::new()
            .route("/health", get(health).with_state(HealthState {}))
            .route("/metrics", get(metrics).with_state(Arc::new(registry)))
    )
}