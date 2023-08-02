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
  "credentialSubject": {
    "attributes": {
      "Another attribute": "World",
      "Attribute 0": 1234,
      "Some attribute": "Hello"
    },
    "id": "did:ccd:testnet:pkc:c162a48f58448234da9f3848dc3bc5fd7f2aa0e4b7e5e15654876365f8b86c1b"
  },
  "validFrom": "1970-01-01T00:00:00.017Z",
  "validUntil": "1970-01-01T00:00:12.345Z",
  "holderRevocable": true,
  "metadataUrl": {
    "url": "http://link/to/schema",
    "hash": null
  }
}
```

An example response is
```json
{
  "txHash": "179de883eb0e748b05dcb3a3632302cea56d0f410df86a1cc4558f3274c1cf3e",
  "credential": {
    "credentialSchema": {
      "id": "http://link/to/schema",
      "type": "JsonSchema2023"
    },
    "credentialSubject": {
      "attributes": {
        "Another attribute": "World",
        "Attribute 0": 1234,
        "Some attribute": "Hello"
      },
      "id": "did:ccd:testnet:pkc:c162a48f58448234da9f3848dc3bc5fd7f2aa0e4b7e5e15654876365f8b86c1b"
    },
    "id": "did:ccd:testnet:sci:3:17/credentialEntry/c162a48f58448234da9f3848dc3bc5fd7f2aa0e4b7e5e15654876365f8b86c1b",
    "issuer": "did:ccd:testnet:sci:3:17/issuer/",
    "proof": {
      "proofPurpose": "assertionMethod",
      "proofValue": "facdb03a1d054a55808875864abc85cc41d2c32290929bbb361a710b0fda5e7f333ac33abdb1b5f0ebb5662335c34410b8e96ca6730df7eb100f814f223d0b07",
      "type": "Ed25519Signature2020",
      "verificationMethod": "did:ccd:testnet:pkc:7f9a19691d30963a13477da2e0e4ee5a78c61000eb36867141b519f003256f9b"
    },
    "randomness": {
      "Another attribute": "6490531ea308a2e661f62c4678e00bb87c9f602be7a053e910f8e44609bc5adb",
      "Attribute 0": "29b439aa58324b2be5c5a3ceb7ba23b48397ba1d1d9081869f56ff1c96a2b32f",
      "Some attribute": "2f5e0279c8ff6bcb004024dd4ba4f3e29d30ec91e3e4583855c2dae35ae83f8d"
    },
    "type": [
      "ConcordiumVerifiableCredential",
      "UniversityDegreeCredential",
      "VerifiableCredential"
    ],
    "validFrom": "1970-01-01T00:00:00.017Z",
    "validUntil": "1970-01-01T00:00:12.345Z"
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
