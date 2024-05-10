# Concordium dApp template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Getting started

Install dependencies:

```bash
yarn
```

Start server:

```bash
yarn start
```

## Configuration

The server is configurable at runtime with a set of arguments:

```
Usage: yarn start [options]

Options:
  -V, --version              output the version number
  --endpoint <URL>           gRPC V2 interface of the node. (default: "http://localhost:20001/", env: CONCORDIUM_WEB3ID_VERIFIER_NODE)
  --listen-address <URL>     Listen address for the server. (default: "http://0.0.0.0:8080/", env: CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS)
  --request-timeout <value>  Request timeout in milliseconds. (default: 5000, env: CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT)
  --network <value>          Network to which the verifier is connected. (default: "Testnet", env: CONCORDIUM_WEB3ID_VERIFIER_NETWORK)
  -h, --help                 display help for command
```

**Run against public testnet node**

```
yarn start --endpoint "https://grpc.testnet.concordium.com:20000"
```
