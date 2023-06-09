## web3id-verifier

A generic verifier for Web3ID credentials. This is a self-contained service that 
handles the retrieval of credentials from the chain, and the cryptographic
verification of presentations.

The API exposed is minimal, there is a single entrypoint `POST v0/verify` which
expects the presentation in a JSON body (and thus requires the corresponding mime-type).

The response to this request will either be 200 together with a JSON body that
contains the request (i.e., challenge and statement for which the presentation
is valid) together with the timestamp and block in which the verification took place.

An example response is
```json
{
  "block": "c4fa02aa6940750e6692639092406f32282b4d414d0aab66222e328caabbd411",
  "blockTime": "2023-06-01T14:15:47.250Z",
  "challenge": "dbd9887999b7ce48236f86fa35d29dd7a8335287b422b186e11ec6d1d02b3291",
  "credentialStatements": [
    {
      "id": "did:ccd:testnet:sci:4718:0/credentialEntry/2eec102b173118dda466411fc7df88093788a34c3e2a4b0a8891f5c671a9d106",
      "statement": [
        {
          "attributeTag": 0,
          "set": [
            "bar",
            "baz",
            "foo",
            "qux"
          ],
          "type": "AttributeInSet"
        },
        {
          "attributeTag": 3,
          "lower": 0,
          "type": "AttributeInRange",
          "upper": 17
        }
      ],
      "type": [
        "ConcordiumVerifiableCredential",
        "MyCredential",
        "VerifiableCredential"
      ]
    }
  ]
}
```

In case of invalid request the error will be in the 4** range, either 404 if
credentials cannot be found, or 400 for invalid proofs or otherwise malformed request.

## Build

To build run `cargo build --release`. This produces the binary `target/release/web3id-verifier`.

## Docker image

A docker image containing the verifier can be built using the
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
    -f services/web3id-verifier/scripts/build.Dockerfile\
    -t web3id-verifier:latest .
```

## Run

- `CONCORDIUM_WEB3ID_VERIFIER_NODE` - address of the node to connect to. (defaults to http://localhost:20000)
- `CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS` - address on which the service
  will listen (defaults to 0.0.0.0:8080)
- `CONCORDIUM_WEB3ID_VERIFIER_LOG_LEVEL` - maximum log level (defaults to `info`)
- `CONCORDIUM_WEB3ID_VERIFIER_LOG_HEADERS` - whether to log request and response
    headers (defaults to `false`)
- `CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT` - timeout of requests (in
  milliseconds), both of requests to the node as well as the entire processing
  of a verification request )] 
- `CONCORDIUM_WEB3ID_VERIFIER_NETWORK` - the network to which the service is
  connected. Either `testnet` or `mainnet`. Defaults to `testnet`
- `CONCORDIUM_WEB3ID_VERIFIER_PROMETHEUS_ADDRESS` - if set, the address on
  which the prometheus server is to be started. The `/metrics` endpoint is
  exposed that contains information about the number and duration of requests.
