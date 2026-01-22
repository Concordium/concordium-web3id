## Unreleased changes.

- Add backend for the V1 verification flow.
- Change Vite environment variable `VITE_BACKEND_API` to `VITE_VERIFIER_V0_API`.
- Change runtime environment variable `BACKEND_API` to `VERIFIER_V0_API`.
- Use `ccd` as `WALLET_CONNECT_SESSION_NAMESPACE` and use `requiredNamespaces` when connecting to a wallet via wallet-connect.

## 2.0.0

- Add support for old and new walletConnect namespaces and chainIDs in the ZK proving flows.
- Add V1 proving and verifying flow for identity credentials.

## 1.2.2

-   Make the verifier backend URL configurable, using the following priority order to determine its value:

1️⃣ Run-time: `BACKEND_API` environment variable injected by Nginx / Docker via the `env.js` file.

2️⃣ Build-time: Vite environment variable `VITE_BACKEND_API`.

3️⃣ Fallback: Default URL pointing to the Concordium hosted testnet verifier.

## 1.2.1

UI change, add ProofDetails component for improved visualization of verifiable presentations.

## 1.2.0

Add new ID attributes (company ID)

## 1.1.0

Add button for connecting to mobile wallets using WalletConnect.

## 1.0.6

-   Upgrade frontend dependencies @concordium/web-sdk and @concordium/browser-wallet-api-helpers

## 1.0.5

Add link to the source code.

## 1.0.4

Fix the date format when submitting proof.

## 1.0.3

Support 'integer' type in the schema.

## 1.0.2

Add support for date-time attributes.

## 1.0.1

Rename `outer` statement to `credential` statement.

## 1.0.0

Initial version.
