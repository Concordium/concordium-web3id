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

| Param        | Type                                                                                                          | Description                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `txHash`     | `string`                                                                                                      | A hash of the transaction, can be used to wait for the credential to be issued. |
| `credential` | [`Web3IdCredential`](https://docs.rs/concordium_base/latest/concordium_base/web3id/enum.Web3IdAttribute.html) | The full, signed, credential.                                                   |

## Usage

The package contains two binaries `telegram` and `discord` that issue Telegram and Discord credentials, respectively.

Run the binaries with `--help` to see a list of parameters.
