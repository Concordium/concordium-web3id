## web3id-issuer

A generic issuer for Web3ID credentials. It exposes a REST API for registering
credentials, and handles the correct formatting of credentials to submit to the
chain, and communication with the node.

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
credential and if successful returns a transaction hash that may be queried for
status.

An example request is
```json
{
  "credential": {
    "commitment": "83bf8600f4f9ad3912767a9e923152678963f096b6781d28b4aac354ae6a13dca78a3b0f110ed981482820ccb436817d",
    "credential_type": "Foo",
    "holder_id": "21a36ad44379339abf0b33816d59129bef9a91e33c90d72ace6504206e26ea76",
    "holder_revocable": true,
    "metadata_url": {
      "hash": null,
      "url": "http:://credential-metadaata.ccd"
    },
    "valid_from": "2023-06-04T18:46:10.218+00:00",
    "valid_until": null
  },
  "data": {
    "contract_address": {
      "index": 4732,
      "subindex": 0
    },
    "encrypted_credential": "98c1ae9a177c217ed8f2ed005800c7c3dffb2d72fa9ae3f10d00525854687f62fab966a123a22cfccbc65ac768f86257ef005594e08cf2da3f6c61d1b06ed3423342a841321a08d5e47f9403457b1f00bd19b6c0d1df2cdb0e4a76a5d458dd9e41fdb3f803e2",
    "timestamp": "2023-06-04T20:46:10+00:00",
    "version": 0
  },
  "signature": "ce6369076343021107f4ad770ba39a762238dd20530053d115ae2ca87d547eef2536d86d34baa6bb954ea2f38c6b7f0f3103e5111159cae03a9ec8ad0929f10c"
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

