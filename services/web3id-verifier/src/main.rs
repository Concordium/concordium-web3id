use clap::Parser;
use web3id_verifier::{configuration::Cli, logging, service};


#[tokio::main]
async fn main() -> anyhow::Result<()> {

    // parse the cli arguments
    let cli = Cli::parse();

    // setup logging and tracing
    logging::init(&cli)?;

    // some verification checks
    anyhow::ensure!(
        cli.request_timeout >= 1000,
        "Request timeout should be at least 1s."
    );

    service::run_service(cli).await
}
