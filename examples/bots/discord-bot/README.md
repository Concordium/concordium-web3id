# ⛔️ DEPRECATED Discord Bot

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
--token <BOT_TOKEN>
    Discord bot API token. [env: DISCORD_BOT_TOKEN=]
--log-level <LOG_LEVEL>
    Maximum log level. [env: DISCORD_BOT_LOG_LEVEL=] [default: info]
--request-timeout <REQUEST_TIMEOUT>
    Request timeout in milliseconds. [env: DISCORD_BOT_REQUEST_TIMEOUT=] [default: 5000]
--verifier-url <VERIFIER_URL>
    URL of the SoMe verifier. [env: DISCORD_BOT_VERIFIER_URL=] [default: http://127.0.0.1/]
```

The URL set by `--verifier-url` must be added as a redirect in the Discord developer platform.

The bot relies on a verification check service, given by `--verifier-url`.
This is also the URL that the bot will link to.


## Docker image

The docker image with the `discord-bot` can be built using the provided
[`Dockerfile`](./scripts/build.Dockerfile).

```console
docker build --build-arg build_image=rust:1.67-buster --build-arg base_image=debian:buster -f examples/bots/discord-bot/scripts/build.Dockerfile .
```

running from the **root** of the repository.

This will produce a docker image with a binary `discord-bot` that is located in
`/usr/local/bin`. That is meant to be the entrypoint of the image.


### Configuration options

      --token <BOT_TOKEN>
          Discord bot API token. [env: DISCORD_BOT_TOKEN=]
      --log-level <LOG_LEVEL>
          Maximum log level. [env: DISCORD_BOT_LOG_LEVEL=] [default: info]
      --request-timeout <REQUEST_TIMEOUT>
          Request timeout in milliseconds. [env: DISCORD_BOT_REQUEST_TIMEOUT=] [default: 5000]
      --verifier-url <VERIFIER_URL>
          URL of the SoMe verifier. [env: DISCORD_BOT_VERIFIER_URL=] [default: http://127.0.0.1/]
