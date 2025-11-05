use std::{future::IntoFuture, sync::Arc};

use anyhow::{Context, Ok};
use concordium_rust_sdk::v2::{self, BlockIdentifier, Scheme};
use futures::TryFutureExt;
use prometheus_client::registry::Registry;
use tokio::net::TcpListener;
use tokio_util::{sync::CancellationToken, task::TaskTracker};
use tonic::transport::ClientTlsConfig;
use tracing::{error, info};

use crate::{configuration::Cli, model::State, routes::{monitoring, presentation_verification}};

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

    // API task setup
    let endpoint = if cli.endpoint.uri().scheme() == Some(&Scheme::HTTPS) {
        cli.endpoint
            .tls_config(ClientTlsConfig::new())
            .context("Unable to construct TLS configuration for Concordium API.")?
    } else {
        cli.endpoint
    };

    // Make it 500ms less than request timeout to make sure we can fail properly
    // with a connection timeout in case of node connectivity problems.
    let node_timeout = std::time::Duration::from_millis(cli.request_timeout - 500);

    let endpoint = endpoint
        .connect_timeout(node_timeout)
        .timeout(node_timeout)
        .http2_keep_alive_interval(std::time::Duration::from_secs(300))
        .keep_alive_timeout(std::time::Duration::from_secs(10))
        .keep_alive_while_idle(true);

    let mut client = v2::Client::new(endpoint)
        .await
        .context("Unable to establish connection to the node.")?;

    let params = client
        .get_cryptographic_parameters(BlockIdentifier::LastFinal)
        .await
        .context("Unable to get cryptographic parameters.")?
        .response;

    let state = State {
        client,
        network: cli.network,
        params: Arc::new(params),
    };

    let api_task = {
        let tcp_listener = TcpListener::bind(cli.listen_address)
            .await
            .context("Parsing TCP listener address failed")?;
        let stop_signal = cancel_token.child_token();
        info!("Server is running at {:?}", cli.listen_address);

        let presentation_verification_router = presentation_verification::verify_presentation_router(state)?;
        axum::serve(tcp_listener, presentation_verification_router)
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

    // api task shutdown signal handling
    let cancel_token_clone = cancel_token.clone();
    task_tracker.spawn(api_task.inspect_err(move |err| {
        error!("API server error: {}", err);
        cancel_token_clone.cancel();
    }));


    // Close out task tracker
    task_tracker.close();
    task_tracker.wait().await;

    info!("Service is shut down");

    Ok(())    
}
