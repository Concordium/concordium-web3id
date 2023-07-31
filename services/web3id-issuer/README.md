## web3id-issuer

A generic issuer for Web3ID credentials. It exposes a REST API for registering
credentials, and handles the correct formatting of credentials to submit to the
chain, construction and signing of commitments, and communication with the node.

The issuer has the following endpoints
- POST `v0/issue`
- GET `v0/status/:transactionHash`

The `status` endpoint returns the minimal status of a transaction.

- If the transaction is not present then `404` status code is returned.
- If return code is 200 then the response is a JSON body with the following
  fields.
  - `status` (required) either `"finalized"` or `"notFinalized"`.
  - `block` (optional) and present if `status` is `"finalized"`. The block hash
    in which the transaction is finalized.
  - `success` (optional) and present if `status` is `"finalized"`. A boolean
    indicating whether the transaction was successful.

An example response is

```json
  {
  "status": "finalized",
  "block": "075a91a1b371a0bb532f357cef3fb126da3580640ddc18963e6f11f9573655cf",
  "success": true
  }
```

## `issue` endpoint

The `issue` endpoint accepts a JSON body with the request to issue the
credential and if successful returns a transaction hash together with the full
credential that can be returned to the user. The transaction hash may be queried
for status.

An example request, requesting to issue a credential with attributes "0" with
value "foo" and "3" with value 17.
```json
{
  "credential": {
    "holder_id": "21a36ad44379339abf0b33816d59129bef9a91e33c90d72ace6504206e26ea76",
    "holder_revocable": true,
    "metadata_url": {
      "hash": null,
      "url": "http:://credential-metadaata.ccd"
    },
    "valid_from": "2023-06-04T18:46:10.218+00:00",
    "valid_until": null
  },
  "values": {
     "0": "foo",
     "3": 17
  }
}
```

An example response is
```json
{
  "txHash": "179de883eb0e748b05dcb3a3632302cea56d0f410df86a1cc4558f3274c1cf3e",
  "credential": {
    "holderId": "21a36ad44379339abf0b33816d59129bef9a91e33c90d72ace6504206e26ea76",
    "issuanceDate": "2023-07-16T11:46:39.573037617Z",
    "registry": {
      "index": 5441,
      "subindex": 0
    },
    "issuerKey": "363e68c4a3ff85c1efef3ca2b79ee8a50bc963c4379dfb5157625acb3ec68f01",
    "values": {
      "0": "foo",
      "3": 3
    },
    "randomness": {
      "0": "2cd739043e967f3cfbf9d7a7a0c9c6be4c97600de3e53f2ddfd0a68ac2989fd4",
      "3": "0596c681c6af2d930203d75d1dc80af51ab5938997018a4b189fe46354d9db0f"
    },
    "signature": "efba61fc4f6ed83ddb46e536833c2568d83a393fc3b8822b6ead451f614f309aa776aa3b91f6d77fd476f83ee492f7258100ce9b5b8954abd03bf495322a7509"
  }
}
```

TODO: Schema/details of the request.

## Build

To build run `cargo build --release`. This produces the binary `target/release/web3id-issuer`.

## Docker image

A docker image containing the relayer and API server can be built using the
provided [`Dockerfile`](./scripts/build.Dockerfile) as follows **from the root
of the repository**. Make sure to do a full repository checkout first using

```
git submodule update --init --recursive
```

Then run

```
docker build \
    --build-arg build_image=rust:1.67-buster\
    --build-arg base_image=debian:buster\
    -f services/web3id-issuer/scripts/build.Dockerfile\
    -t web3id-issuer:latest .
```

## Run

To run the service the following configuration options should be set unless the
stated defaults suffice.

- `CONCORDIUM_WEB3ID_ISSUER_NODE` - address of the node to connect to.
- `CONCORDIUM_WEB3ID_ISSUER_API_LISTEN_ADDRESS` - address on which the service
  will listen (defaults to 0.0.0.0:8080)
- `CONCORDIUM_WEB3ID_ISSUER_LOG_LEVEL` - maximum log level (defaults to `info`)
- `CONCORDIUM_WEB3ID_ISSUER_LOG_HEADERS` - whether to log request and response
    headers (defaults to `false`)
- `CONCORDIUM_WEB3ID_ISSUER_REQUEST_TIMEOUT` - timeout of requests (in
  milliseconds), both of requests to the node as well as the entire processing
  of a request
- `CONCORDIUM_WEB3ID_ISSUER_NETWORK` - the network to which the service is
  connected. Either `testnet` or `mainnet`. Defaults to `testnet`
- `CONCORDIUM_WEB3ID_ISSUER_PROMETHEUS_ADDRESS` - if set, the address on
  which the prometheus server is to be started. The `/metrics` endpoint is
  exposed that contains information about the number and duration of requests.
- `CONCORDIUM_WEB3ID_ISSUER_MAX_REGISTER_ENERGY` - The maximum **execution
  energy** allowed for the register transaction. Defaults to 10000.
- `CONCORDIUM_WEB3ID_ISSUER_REGISTRY_ADDRESS` - The address of the registry
  contract in which to register the credential.
- `CONCORDIUM_WEB3ID_ISSUER_WALLET` - The path to the account that the issuer
  uses to update the registry contract with new credentials.
- `CONCORDIUM_WEB3ID_ISSUER_KEY` - The ed25519 keypair which is used by the
  issuer to sign commitments that are sent to the user. It must correspond to
  the issuer's public key registered in the contract.
