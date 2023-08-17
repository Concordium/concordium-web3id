## Frontend for testing Web3ID proofs using wallets

### Build

This is a typescript project. You need `yarn` to build it. To build run

```
yarn install
yarn build
```

This will produce `index.html` and `index.js` in a `dist` directory. That is the artifact that needs to be served.

To change the verifier URL modify the `getVerifierURL` function in `index.tsx`.
By default it uses https://web3id-verifier.testnet.concordium.com

### Development

Use `yarn watch` to automatically rebuild upon changes.
Use `yarn lint` to check formatting and common issues. Use `yarn lint-and-fix` to automatically fix a number of issues (e.g., formatting).
Use `yarn start` to serve the pages locally.
