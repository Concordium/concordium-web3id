use std::{net::{SocketAddr, TcpStream}, sync::{Arc, OnceLock}, thread, time::Duration};

use tokio::time::Instant;
use tracing::{info, level_filters::LevelFilter};
use web3id_verifier::{configuration::Cli, logging, service};

use concordium_rust_sdk::web3id::did::Network;

use crate::integration_test_helpers::{node_mock::{self, NodeMock}, rest_client::{self, RestClient}};

const REST_PORT: u16 = 18000;
const MONITORING_PORT: u16 = 18001;

fn config(node_base_url: &str) -> Cli {
    Cli { 
        endpoint: node_base_url.parse().unwrap(), 
        listen_address: SocketAddr::new("0.0.0.0".parse().unwrap(), REST_PORT), 
        log_level: LevelFilter::INFO, 
        log_headers: true, 
        request_timeout: 1000u64, 
        network: Network::Testnet, 
        prometheus_address: Some(SocketAddr::new("0.0.0.0".parse().unwrap(), MONITORING_PORT)), 
        monitoring_listen:  SocketAddr::new("0.0.0.0".parse().unwrap(), MONITORING_PORT)
    }
}

#[derive(Clone)]
struct Stubs {
    config: Cli,
}

fn init_stubs(node_base_url: &str) -> Stubs {
    let config = config(node_base_url);

    Stubs { config }
}

#[derive(Debug, Clone)]
pub struct ServerHandle {
    properties: Arc<ServerProperties>,
    node_mock: NodeMock,
    rest_client: RestClient,
    monitoring_client: RestClient,
}

#[allow(dead_code)]
#[derive(Debug)]
pub struct ServerProperties {
    pub rest_url: String,
    pub monitoring_url: String,
    pub node_url: String,
}

#[allow(dead_code)]
impl ServerHandle {
    pub fn node_mock(&self) -> &NodeMock {
        &self.node_mock
    }

    pub fn rest_client(&self) -> &RestClient {
        &self.rest_client
    }

    pub fn monitoring_client(&self) -> &RestClient {
        &self.monitoring_client
    }

    pub fn properties(&self) -> &ServerProperties {
        &self.properties
    }
}

static START_SERVER_ONCE: OnceLock<ServerHandle> = OnceLock::new();

pub fn start_server() -> ServerHandle {
    Clone::clone(START_SERVER_ONCE.get_or_init(|| start_server_impl()))
}

fn start_server_impl() -> ServerHandle {
    // Create runtime that persists between tests
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(2)
        .build()
        .expect("tokio runtime");

    // start node mock
    let server_init = ServerStartup::new();
    let rt_handle = runtime.handle().clone();
    let node_mock = thread::spawn(move || rt_handle.block_on(node_mock::init_mock(&server_init)))
        .join()
        .unwrap();

    let stubs = init_stubs(&node_mock.base_url());
    logging::init(&stubs.config).unwrap();

    let stubs_clone = stubs.clone();
    let rt_handle_clone = runtime.handle().clone();

    // start verifier service
    thread::spawn(move || {
        rt_handle_clone.block_on(async move {
            info!("starting web3id verifier service for test");
            if let Err(e) = service::run_service(stubs_clone.config).await {
                eprintln!("web3id-verifier exited with error: {:?}", e);
            }
        });
    });

    // create connection urls for server
    let properties = ServerProperties {
        rest_url: format!("http://127.0.0.1:{}", REST_PORT),
        monitoring_url: format!("http://127.0.0.1:{}", MONITORING_PORT),
        node_url: stubs.config.endpoint.uri().to_string(),
    };

    // waiting for monitoring to start
    info!("waiting for the web3id verifier monitoring to start...");
    let start = Instant::now();
    while TcpStream::connect(("127.0.0.1", MONITORING_PORT)).is_err() {
        if start.elapsed() > Duration::from_secs(60) {
            panic!("server did not start within 60 seconds");
        }
        thread::sleep(Duration::from_millis(500));
    }

    // create clients
    let rest_client = rest_client::create_client(properties.rest_url.clone());
    let monitoring_client = rest_client::create_client(properties.monitoring_url.clone());

    info!("web3id verifier started with properties:\n{:#?}", properties);

    ServerHandle {
        properties: Arc::new(properties),
        node_mock,
        rest_client,
        monitoring_client,
    }
}


async fn run_server(stubs: Stubs) {
    info!("starting server for test");
    service::run_service(stubs.config)
        .await
        .expect("running server")
}

pub struct ServerStartup {
    _private: (),
}

impl ServerStartup {
    fn new() -> Self {
        Self { _private: () }
    }
}