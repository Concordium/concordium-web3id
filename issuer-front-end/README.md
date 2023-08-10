# Issuer Front End Wallet Testing

This is front end is used for testing the new browser wallet functionalities. 

The front end has two flows:

- An issuer can deploy a new smart contract instance of the credential_registry_smart_contract.
- Someone can issue a new credentials by invoking the corresponding function in the credential_registry_smart_contract via the concordium browser wallet.

Only the browser wallet (no walletConnect) is supported in the first version.

## Prerequisites

-   Browser wallet extension must be installed in Chrome browser and the Concordium testnet needs to be selected.

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

These extra intall steps are needed because some helpers packages need to be built from the submodule links.

To start the front end locally, do the following:

-   Run `yarn build` in this folder.
-   Run `yarn start` in this folder.
-   Open URL logged in console (typically http://127.0.0.1:8080).

To have hot-reload (useful for development), do the following instead:

-   Run `yarn watch` in this folder in a terminal.
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
docker build -f issuer-front-end/Dockerfile -t issuer-front-end:$PROJECT_VERSION .
```

e.g.

```
docker build -f issuer-front-end/Dockerfile -t issuer-front-end:3.0.0 .
```

To run the docker image run the following command:

```
docker run -it -d -p 8080:80 --name web issuer-front-end:$PROJECT_VERSION
```

e.g.

```
docker run -it -d -p 8080:80 --name web issuer-front-end:3.0.0
```

Open http://127.0.0.1:8080 in your browser.

