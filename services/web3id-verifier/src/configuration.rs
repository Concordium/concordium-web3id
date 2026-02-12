use clap::Parser;
use concordium_rust_sdk::v2;
use concordium_rust_sdk::web3id::did::Network;
use std::net::SocketAddr;

#[derive(Clone, Parser)]
pub struct Cli {
    /// the endpoint url for the node, takes the form of:
    /// http://example:port
    #[arg(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://localhost:20000",
        env = "CONCORDIUM_WEB3ID_VERIFIER_NODE"
    )]
    pub endpoint: v2::Endpoint,

    /// the listen address for this web3id server
    #[clap(
        long = "listen-address",
        default_value = "0.0.0.0:8080",
        help = "Listen address for the server.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS"
    )]
    pub listen_address: std::net::SocketAddr,

    /// log level to start this service
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_LOG_LEVEL"
    )]
    pub log_level: tracing_subscriber::filter::LevelFilter,

    /// whether headers should be logged or not for requests and responses
    #[clap(
        long = "log-headers",
        help = "Whether to log headers for requests and responses.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_LOG_HEADERS"
    )]
    pub log_headers: bool,

    /// the request timeout in milliseconds
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT"
    )]
    pub request_timeout: u64,

    /// Network that the verifier is connected to. Example `testnet` or `mainnet`
    #[clap(
        long = "network",
        help = "Network to which the verifier is connected.",
        default_value = "testnet",
        env = "CONCORDIUM_WEB3ID_VERIFIER_NETWORK"
    )]
    pub network: Network,

    /// prometheus address for metrics scraping
    #[clap(
        long = "prometheus-address",
        help = "Address to which the Prometheus server should bind. If not set, the Prometheus \
                server will not start.",
        env = "CONCORDIUM_WEB3ID_VERIFIER_PROMETHEUS_ADDRESS"
    )]
    pub prometheus_address: Option<std::net::SocketAddr>,

    /// Address to listen for monitoring related requests
    #[arg(
        long,
        env = "WALLET_PROXY_MONITORING_ADDRESS",
        default_value = "127.0.0.1:8003"
    )]
    pub monitoring_listen: SocketAddr,
}
