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
--token <BOT_TOKEN>            Telegram bot API token.
--log-level <LOG_LEVEL>        Maximum log level. [default: info]
--verifier-url <VERIFIER_URL>  URL of the SoMe verifier. [default: http://127.0.0.1:8080/]
```

The domain of the bot must be set to the SoMe Issuer url. This can be configured by messaging @BotFather on Telegram.

The bot relies on a verification check service, given by `--verifier-url`.\
This is also the URL that the bot will link to.

Note: When running locally `http://127.0.0.1:<port>/` must be used, `http://localhost:<port>/` won't work.