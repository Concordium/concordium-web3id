# SoMe Web3 ID Issuer dApp

Issues Web3 ID credentials for Telegram and Discord.

## API

Both services serve credential schemas and credential metadata at `/json-schemas`.

### POST `/credential`

Requests to have a Web3 ID credential issued.

Takes params as JSON:

| Param          | Type                                                                                                             | Description                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `credential`   | [`CredentialInfo`](https://docs.rs/concordium_base/latest/concordium_base/cis4_types/struct.CredentialInfo.html) | Web3 ID credential to issue.                      |
| `telegramUser` | [`TelegramUser`](https://core.telegram.org/widgets/login)                                                        | (Telegram only) Telegram user data received from. |

On success, returns as JSON:

| Param        | Type                                                                                                             | Description                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `txHash`     | `string`                                                                                                         | A hash of the transaction, can be used to wait for the credential to be issued. |
| `credential` | [`Web3IdCredential`](https://docs.rs/concordium_base/latest/concordium_base/web3id/struct.Web3IdCredential.html) | The full, signed, credential.                                                   |

## Usage

The package contains two binaries `telegram` and `discord` that issue Telegram and Discord credentials, respectively.

Run the binaries with `--help` to see a list of parameters.


## Docker image

The docker image with the `discord` and `telegram` issuers can be built using the provided
[`Dockerfile`](./scripts/build.Dockerfile).

```console
docker build --build-arg build_image=rust:1.67-buster --build-arg base_image=debian:buster -f examples/some-issuer/scripts/build.Dockerfile .
```

running from the **root** of the repository.

This will produce a docker image with binaries `discord` and `telegram` located in
`/usr/local/bin`. These are meant to be the entrypoints of the image.

### Configuration of the discord issuer

The following configuration options are supported

      --node <ENDPOINT>
          GRPC V2 interface of the node. [env: DISCORD_ISSUER_NODE=] [default: http://localhost:20000]
      --log-level <LOG_LEVEL>
          Maximum log level. [env: DISCORD_ISSUER_LOG_LEVEL=] [default: info]
      --network <NETWORK>
          The network of the issuer. [env: DISCORD_ISSUER_NETWORK=] [default: testnet]
      --request-timeout <REQUEST_TIMEOUT>
          Request timeout in milliseconds. [env: DISCORD_ISSUER_REQUEST_TIMEOUT=] [default: 5000]
      --registry <REGISTRY>
          Address of the registry smart contract. [env: DISCORD_ISSUER_REGISTRY_ADDRESS=]
      --wallet <WALLET>
          Path to the wallet keys. [env: DISCORD_ISSUER_WALLET=]
      --issuer-key <ISSUER_KEY>
          Path to the issuer's key, used to sign commitments. [env: DISCORD_ISSUER_KEY=]
      --max-register-energy <MAX_REGISTER_ENERGY>
          The amount of energy to allow for execution of the register credential transaction. This must be less than max block energy of the chain the service is connected to. [env: DISCORD_ISSUER_MAX_REGISTER_ENERGY=] [default: 10000]
      --discord-client-id <DISCORD_CLIENT_ID>
          Discord client ID for OAuth2. [env: DISCORD_CLIENT_ID=]
      --discord-client-secret <DISCORD_CLIENT_SECRET>
          Discord client secret for OAuth2. [env: DISCORD_CLIENT_SECRET=]
      --listen-address <LISTEN_ADDRESS>
          Socket addres for the Discord issuer. [env: DISCORD_ISSUER_LISTEN_ADDRESS=] [default: 0.0.0.0:8081]
      --url <URL>
          URL of the Discord issuer. [env: DISCORD_ISSUER_URL=] [default: http://127.0.0.1:8081/]
      --verifier-dapp-domain <VERIFIER_DAPP_DOMAIN>
          The domain of the verifier dApp, used for CORS. [env: DISCORD_ISSUER_VERIFIER_DAPP_URL=] [default: http://127.0.0.1]
      --frontend <FRONTEND_ASSETS>
          Path to the directory where frontend assets are located. [env: DISCORD_ISSUER_FRONTEND=] [default: ./frontend/dist/discord]


### Configuration of the telegram issuer

      --node <ENDPOINT>
          GRPC V2 interface of the node. [env: TELEGRAM_ISSUER_NODE=] [default: http://localhost:20000]
      --log-level <LOG_LEVEL>
          Maximum log level. [env: TELEGRAM_ISSUER_LOG_LEVEL=] [default: info]
      --request-timeout <REQUEST_TIMEOUT>
          Request timeout in milliseconds. [env: TELEGRAM_ISSUER_REQUEST_TIMEOUT=] [default: 5000]
      --registry <REGISTRY>
          Address of the registry smart contract. [env: TELEGRAM_ISSUER_REGISTRY_ADDRESS=]
      --network <NETWORK>
          The network of the issuer. [env: TELEGRAM_ISSUER_NETWORK=] [default: testnet]
      --wallet <WALLET>
          Path to the wallet keys. [env: TELEGRAM_ISSUER_WALLET=]
      --issuer-key <ISSUER_KEY>
          Path to the issuer's key, used to sign commitments. [env: TELEGRAM_ISSUER_KEY=]
      --max-register-energy <MAX_REGISTER_ENERGY>
          The amount of energy to allow for execution of the register credential transaction. This must be less than max block energy of the chain the service is connected to. [env: TELEGRAM_ISSUER_MAX_REGISTER_ENERGY=] [default: 10000]
      --telegram-token <TELEGRAM_BOT_TOKEN>
          Bot token for Telegram. [env: TELEGRAM_ISSUER_TELEGRAM_BOT_TOKEN=]
      --listen-address <LISTEN_ADDRESS>
          Socket address for the Telegram issuer. [env: TELEGRAM_ISSUER_LISTEN_ADDRESS=] [default: 0.0.0.0:80]
      --url <URL>
          URL of the Telegram issuer. [env: TELEGRAM_ISSUER_URL=] [default: http://127.0.0.1/]
      --verifier-dapp-domain <VERIFIER_DAPP_DOMAIN>
          The domain of the verifier dApp, used for CORS. [env: TELEGRAM_ISSUER_VERIFIER_DAPP_URL=] [default: http://127.0.0.1]
      --telegram-bot-name <TELEGRAM_BOT_NAME>
          The name (handle) of the Telegram bot. [env: TELEGRAM_ISSUER_TELEGRAM_BOT_NAME=]
      --frontend <FRONTEND_ASSETS>
          Path to the directory where frontend assets are located. [env: TELEGRAM_ISSUER_FRONTEND=] [default: ./frontend/dist/telegram]

