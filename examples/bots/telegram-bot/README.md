# Telegram Bot

Telegram bot that can redirect users to the verification dApp and check the verification status.

The bot repsonds to the following commands:

```
/start  - starts a new chat.
/help   - displays the list of commands.
/verify - sends a link to the SoMe verifier dApp.
/check  - used in reply to another message. Replies with the verification status of the sender.
```

## Usage

Arguments:

```
--token <BOT_TOKEN>
    Telegram bot API token. [env: TELEGRAM_BOT_TOKEN=]
--log-level <LOG_LEVEL>
    Maximum log level. [env: TELEGRAM_BOT_LOG_LEVEL=] [default: info]
--request-timeout <REQUEST_TIMEOUT>
    Request timeout in milliseconds. [env: TELEGRAM_BOT_REQUEST_TIMEOUT=] [default: 5000]
--verifier-url <VERIFIER_URL>
    URL of the SoMe verifier. [env: TELEGRAM_BOT_VERIFIER_URL=] [default: http://127.0.0.1/]
```

In order for the "Login with Telegram" feature on the dApp to work, the bot needs to have its "domain" set (to match `--verifier-url`).
This can be configured by messaging @BotFather on Telegram, see [https://core.telegram.org/widgets/login](https://core.telegram.org/widgets/login).

The bot relies on a verification check service, given by `--verifier-url`.
This is also the URL that the bot will link to.

Note: When running locally `--verifier-url` must be set to `http://127.0.0.1/`,
if `http://localhost/` is used, the bot refuses to send a link.
