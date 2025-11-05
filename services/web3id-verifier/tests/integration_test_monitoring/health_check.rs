use crate::integration_test_helpers::server;
use concordium_rust_sdk::v2::{generated::{self}};
use reqwest::StatusCode;

/// Test healthcheck endpoint
#[tokio::test]
async fn test_healthcheck() {
    let handle = server::start_server();

    // mock for get cryptographic parameters
    handle.node_mock().mock(|when, then| {
        when.path("/concordium.v2.Queries/GetCryptographicParameters")
            .pb(generated::AbsoluteBlockHeight::default());
        then.pb(generated::CryptographicParameters {
            ..Default::default()
        });
    });

    let resp = handle
        .monitoring_client()
        .get("/health")
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);

    //let _body: value::Value = resp.json().await.unwrap();
}


