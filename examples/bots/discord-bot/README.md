# Discord Bot
The Discord bot that can redirect users to the verification dApp and check the verification status.

The bot repsonds to the following commands:
```
/help        Displays the list of commands
/verify      Verify with Concordium
/check       Checks the verification status of a user
```

## Usage
Arguments:
```
--token <BOT_TOKEN>            Discord bot API token.
--log-level <LOG_LEVEL>        Maximum log level. [default: info]
--verifier-url <VERIFIER_URL>  URL of the SoMe verifier. [default: http://127.0.0.1:8080/]
```

The URL set by `--verifier-url` must be added as a redirect in the Discord developer platform.

The bot relies on a verification check service, given by `--verifier-url`.\
This is also the URL that the bot will link to.
