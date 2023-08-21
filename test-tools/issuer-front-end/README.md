# Issuer Front End Wallet Testing

This front end is used for testing the new browser wallet functionalities concerning the web3ID infrastructure.
You can manually issue/create credentials using this front end. Only the browser wallet (no walletConnect) is supported in the first version.
The front end initializes and interacts with the [`credential_registry` smart contract](https://github.com/Concordium/concordium-rust-smart-contracts/tree/main/examples/credential-registry).

The available front-end flows are:

Positive test cases:

- 1. step to create issuer keys.
- 2. step to deploy new `credential_registry` smart contract (each issuer deploys their own smart contract).
- 3. step to input the newly created `credential_registry` smart contract index.
- 4. step to issue a new credential.
- 5. step to display the credential entry in the `credential_registry` smart contract.
- 6. step to revoke credential by the issuer.

Negative test cases:

- 7. step to issue a new credential (Issuer registers credential delayed in the smart contract).
- 8. step to issue a new credential (Issuer fails to use the correct randomness/signature to register the credential in the wallet).

## Prerequisites

- Browser wallet extension must be installed and the Concordium testnet needs to be selected.
- The [test issuer backend](https://github.com/Concordium/concordium-web3id/tree/main/test-tools/test-issuer-frontend/backend) has to be set up and running:
```cargo run -- --listen-address 0.0.0.0:3000```

## Running the front end

Clone the repo:

```shell
git clone git@github.com:Concordium/concordium-web3id.git
```

Navigate into this folder:
```shell
cd ./issuer-front-end
```

-   Run `yarn install` in this folder.
-   Run `yarn preinstall` in this folder.
-   Run `yarn install` in this folder.

These extra install steps are needed because some packages have to be built from the submodule link.

To start the front end locally, do the following:

-   Set the environment variable `BACKEND_API` to the address where the backend is started, e.g., `http://localhost:3000`
-   Run `yarn build` in this folder, e.g.,
    `BACKEND_API=http://localhost:3000 yarn build`
-   Run `yarn start` in this folder.
-   Open URL logged in console (typically http://127.0.0.1:8080).

To have hot-reload (useful for development), do the following instead:

-   Run `BACKEND_API=http://localhost:3000 yarn watch` in this folder in a terminal.
-   Run `yarn start` in this folder in another terminal.
-   Open URL logged in console (typically http://127.0.0.1:8080).

## Using yarn (on Unix/macOS systems)

Some of the node modules have Windows-type line endings (\r\n), instead of Unix line endings (\n), which causes problems when using an old yarn package manager.

If you see an error message similar to this when executing `yarn start`, then you've run into the problem:
```shell
env: node\r: No such file or directory
```

Use `npm install` instead of `yarn install` in the above command or use an up-to-date `yarn` version (non-classic `yarn` version). `npm` (newer non-classic `yarn` versions) will correct the line ending.

Additional information can be found [here](https://techtalkbook.com/env-noder-no-such-file-or-directory/).

## Build and run the Docker image

To build the docker image run the following command **from the root of the repository**:

```
docker build -f test-tools/issuer-front-end/Dockerfile -t issuer-front-end:$PROJECT_VERSION .
```

e.g.

```
docker build -f test-tools/issuer-front-end/Dockerfile -t issuer-front-end:3.0.0 .
```

To run the docker image run the following command:

```
docker run -it -p 8080:8080 --name web issuer-front-end:$PROJECT_VERSION
```

e.g.

```
docker run -it -p 8080:8080 --name web issuer-front-end:3.0.0
```

Open http://127.0.0.1:8080 in your browser.


### Configuration options

The docker container supports the following runtime configuration options

- `CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_NODE` the address of the node to
  connect to. Both `http` and `https` schemas are supported.
- `CONCORDIUM_TEST_ISSUER_BACKEND_LISTEN_ADDRESS` the address where the server
  will listen. Defaults to `0.0.0.0:8080`
- `CONCORDIUM_TEST_ISSUER_BACKEND_ISSUER_LOG_LEVEL` the log level, defaults to `info`
- `CONCORDIUM_TEST_ISSUER_BACKEND_LOG_HEADERS` - whether to log headers in
  requests and responses. Mainly useful for debugging.
- `CONCORDIUM_TEST_ISSUER_BACKEND_REQUEST_TIMEOUT` - timeout of requests in
  milliseconds (defaults to 5s)
