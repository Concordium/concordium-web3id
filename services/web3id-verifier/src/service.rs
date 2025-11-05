use std::future::IntoFuture;

use anyhow::{Context, Ok};
use futures::TryFutureExt;
use prometheus_client::registry::Registry;
use tokio::net::TcpListener;
use tokio_util::{sync::CancellationToken, task::TaskTracker};
use tracing::{error, info};

use crate::{configuration::Cli, routes::monitoring};

/// Run Service function which parses the cli arguments and spawns the threads which handle monitoring/health and service api's
pub async fn run_service(cli: Cli) -> anyhow::Result<()> {

    let mut metrics_registry = Registry::default();
    let cancel_token = CancellationToken::new();

    // Monitoring Task for health and metrics scraping
    let monitoring_task = {
        let tcp_listener = TcpListener::bind(cli.monitoring_listen)
            .await
            .context("Parsing TCP listener address failed")?;
        let stop_signal = cancel_token.child_token();
        info!(
            "Monitoring server is running at {:?}",
            cli.monitoring_listen
        );
        let monitoring_router = monitoring::monitoring_router(metrics_registry)?;
        axum::serve(tcp_listener, monitoring_router)
            .with_graceful_shutdown(stop_signal.cancelled_owned())
            .into_future()
    };

    // general shutdown signal handling
    let cancel_token_clone = cancel_token.clone();
    tokio::spawn({
        async move {
            tokio::signal::ctrl_c().await.ok();
            info!("Received signal to shutdown");
            cancel_token_clone.cancel();
        }
    });

    let task_tracker = TaskTracker::new();

    // monitoring task shutdown signal handling
    let cancel_token_clone = cancel_token.clone();
    task_tracker.spawn(monitoring_task.inspect_err(move |err| {
        error!("Monitoring server error: {}", err);
        cancel_token_clone.cancel();
    }));


    // Close out task tracker
    task_tracker.close();
    task_tracker.wait().await;

    info!("Service is shut down");

    Ok(())    
}