use crate::configuration::Cli;


pub fn init(cli: &Cli) -> anyhow::Result<()>{
    {
        use tracing_subscriber::prelude::*;
        let log_filter = tracing_subscriber::filter::Targets::new()
            .with_target(module_path!(), cli.log_level)
            .with_target("tower_http", cli.log_level);
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
            .init();
    }

    {
        tracing::info!("Starting service version {}", env!("CARGO_PKG_VERSION"));
        tracing::info!("Connecting to node at {}", cli.endpoint.uri());
        tracing::info!("On network: {}", cli.network);
        tracing::info!("Listening on: {}", cli.listen_address);
    }

    Ok(())
}