# SoMe Web3 ID Issuer dApp

## Available Scripts

In the project directory, you can run:

### `yarn build-[telegram|discord]`

Builds the app for production to the `dist/[telegram|discord]` folder.

### `yarn dev-[telegram|discord]`

Runs the frontend for the corresponding issuer in the development mode.

The page will reload if you make edits.\
You will also see any lint errors in the console.

#### Required configuration

Depending on the issuer the frontend is run for, a set of environment variables are required to configure the service:

**Discord**

```bash
export DISCORD_ISSUER_NETWORK= # e.g. testnet or mainnet
export DISCORD_CLIENT_ID= # discord client ID for oAuth
export DISCORD_ISSUER_REGISTRY_ADDRESS= # contract address of discord registry contract
```

**Telegram**

```bash
export TELEGRAM_ISSUER_NETWORK= # e.g. testnet or mainnet
export TELEGRAM_ISSUER_TELEGRAM_BOT_NAME= # name of the bot, used for authentication
export TELEGRAM_ISSUER_REGISTRY_ADDRESS= # contract address of telegram registry contract
```
