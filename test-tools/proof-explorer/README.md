## Frontend for testing Web3ID proofs using wallets

### Build

This is a typescript project. You need `yarn` to build it. To install dependencies run:

```
yarn install
```

After that run
```
yarn build
```

This will produce `index.html` and `index.js` in a `dist` directory. That is the artifact that needs to be served.

To change the verifier URL modify the `getVerifierURL` function in `index.tsx`.
By default it uses https://web3id-verifier.testnet.concordium.com

### Development

Use `yarn dev` to serve the pages locally.
Use `yarn lint` to check formatting and common issues. Use `yarn lint-and-fix` to automatically fix a number of issues (e.g., formatting).

### Environmental variable

The ZK (zero knowledge) verifier backend URL is configurable, using the following priority order to determine its value:

- 1️⃣ Runtime value injected by Nginx / Docker via the `env.js` file.
- 2️⃣ Build-time value from the Vite environment variable `VITE_BACKEND_API`.
- 3️⃣ Fallback Concordium hosted testnet verifier URL [https://web3id-verifier.testnet.concordium.com](https://github.com/Concordium/concordium-web3id/tree/main/services/web3id-verifier)

For example, you can use a custom ZK (zero knowledge) verifier backend with the `VITE_BACKEND_API` env as follows:

```console
VITE_BACKEND_API=http://localhost:7017 yarn dev
```

## Docker image

A docker image that serves the frontend can be built by running (**from the root
of the repository**)

```console
docker build -f test-tools/proof-explorer/Dockerfile .
```

It does not need any configuration options, and the resulting container has no
configuration options. The entrypoint simply serves the frontend at port 80.