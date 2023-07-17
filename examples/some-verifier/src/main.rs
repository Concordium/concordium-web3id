use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use clap::Parser;
use db::{Platform, Telegram, Verified};

use crate::db::{Database, Discord};

mod db;

#[derive(clap::Parser, Debug)]
#[clap(version, author)]
struct App {
    #[clap(
        long = "db",
        default_value = "host=localhost dbname=some-verifier user=postgres password=password port=5432",
        help = "Database connection string.",
        env = "SOME_VERIFIER_DB_STRING"
    )]
    db_config: tokio_postgres::Config,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "SOME_VERIFIER_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "api-port",
        default_value = "8080",
        help = "Port of the verification check API.",
        env = "SOME_VERIFIER_API_PORT"
    )]
    api_port: u16,
}

#[derive(Clone)]
struct AppState {
    database: Arc<Database>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(app.log_level)
            .init();
    }

    tracing::info!("Connecting to database...");
    let database = Database::connect(app.db_config).await?;

    let state = AppState {
        database: Arc::new(database),
    };

    tracing::info!("Starting server...");
    let router = Router::new()
        .route("/check/telegram/:id", get(handle_check::<Telegram>))
        .route("/check/discord/:id", get(handle_check::<Discord>))
        .with_state(state);

    let socket = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), app.api_port);
    axum::Server::bind(&socket)
        .serve(router.into_make_service())
        .await
        .unwrap();

    Ok(())
}

async fn handle_check<P: Platform>(
    State(state): State<AppState>,
    Path(id): Path<P::Id>,
) -> Json<Verified> {
    let res = state
        .database
        .get_accounts::<P>(id)
        .await
        .unwrap_or_default();
    Json(res)
}
