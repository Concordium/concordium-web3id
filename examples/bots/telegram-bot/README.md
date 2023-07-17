# Telegram Bot
Telegram bot that can redirect users to the verification dApp and check the verification status.

## Usage
Arguments:
```
--token <BOT_TOKEN>      Telegram bot API token. [env: TELEGRAM_BOT_TOKEN=]
--log-level <LOG_LEVEL>  Maximum log level. [env: TELEGRAM_BOT_LOG_LEVEL=] [default: info]
--dapp-url <DAPP_URL>    URL of the verification dapp. [env: SOME_ISSUER_URL=] [default: http://127.0.0.1/]
```

The domain of the bot must be the same as the `--dapp-url` parameter. This can be configured by messaging @BotFather on Telegram.

When running locally `http://127.0.0.1/` must be used, `http://localhost:<port>/` won't work. This also means that the dApp must be hosted on port 80.