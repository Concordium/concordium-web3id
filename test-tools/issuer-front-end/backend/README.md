## Support for test issuer.

This service is a test tool to support a testing frontend for issuing Web3ID
credentials.

It supports the frontend to generate issuer keys and sign credential commitments
which is not practical to do inside a browser.

The test issuer has the following endpoints
- GET `v0/key/:seed`
- POST `v0/commitments/:seed`

Where `seed` is a string that will be used to generate (deterministically)
secret keys for the issuer.

The `/v0/key` endpoint returns a JSON object with two fields like so

```json
{
  "signKey": "5dc9b87086fd82c0c36941611e926e47ec4a0549c539c15790650df20801fd31",
  "verifyKey": "d9f196fbb3fd2581bcb22702e31e68b8e4df39b53f928ed40b046a1c9fffbb08"
}
```

The `/v0/commitments/` endpoint expects a JSON object in the following format
```json
{
    "attributes": {
        "Hello": "World",
        "No": "Yes",
        "Three": 3
    },
    "holderId": "e9df2e0b7e18d36f91a80f042707847138f4655653643cfd8b18d4abdad79f63",
    "issuer": {
        "index": 17,
        "subindex": 0
    }
}
```

where the `attributes` object is an arbitrary object where values are either
strings or unsigned integers. The `holderId` is the public key of the holder of
the credential. For the request above the response on the endpoint
`/v0/commitments/ff` is going to be

```json
{
  "signedCommitments": {
    "signature": "e8c3944d6a9a19e74ad3ef028b04c0637756540306aba8842000f557cbfb7415187f907d26f20474081d4084fc8e5ff14167171f65fac76b06508ae46f55aa05",
    "commitments": {
      "Hello": "8284b5a66dae27caa142136a094b1d783f2071b572d7d53cdb5db7929a5cb1ee721230412f929a2e53bcf2e8560a5388",
      "No": "8a6663d5006190e7afbd2aa740ec66e74b553de63e987e7918128a155416d40165811ba2b3c3e32694a8a9cb48ae01ce",
      "Three": "b4367e04fcc0564827d49b49ce8bfde24c9218e7339d8f04766ddbfddf53d64facaad88e45ead65255faf17e7fc67e11"
    }
  },
  "randomness": {
    "Hello": "2d5bbf82232465715f23396f4ece8ccc40ad178b7262d01aad97c9de5380ae07",
    "No": "0cc9acd652b6c29aaff42bcf8da242afee622262b0d3e37f17c57ac8d4ae42d9",
    "Three": "1fad03391f7c8d72980e53a44e0782f58822eb74f06ff2c7e9e09e6b08f7ca73"
  }
}
```

An example request can be made as follows
```console
curl -H 'Content-Type: application/json' -d @request.json localhost:8080/v0/commitments/ff
```
assuming the request above is stored in the file `request.json`.


## Build

To build run `cargo build --release`. This produces the binary `target/release/test-issuer-backend`.

## Run

To run the service the following configuration options should be set unless the
stated defaults suffice.


- `CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_NODE` the address of the node to
  connect to. Both `http` and `https` schemas are supported.
- `CONCORDIUM_TEST_ISSUER_BACKEND_LISTEN_ADDRESS` the address where the server
  will listen. Defaults to `0.0.0.0:8080`
- `CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_LOG_LEVEL` the log level, defaults to `info`
- `CONCORDIUM_TEST_ISSUER_BACKEND_LOG_HEADERS` - whether to log headers in
  requests and responses. Mainly useful for debugging.
- `CONCORDIUM_TEST_ISSUER_BACKEND_REQUEST_TIMEOUT` - timeout of requests in
  milliseconds (defaults to 5s)
- `CONCORDIUM_TEST_ISSUER_BACKEND_SERVE_DIR` - if set it must be set to a
  directory, and the contents of that directory will be served. If the directory
  contains `index.html` file then that file will be served from the root path.


The most common invocation for local development would be (from the directory of the README file)

```console
    cargo run -- --node http://node.testnet.concordium.com:20000 --log-level=debug --dir ../dist
```
