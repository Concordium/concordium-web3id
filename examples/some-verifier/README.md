# SoMe Web3 ID Verifier dApp and API

Checks social media credentials issued by the SoMe Web3 ID Issuer.\
Also serves an API to the social media bots, where they can query they verification status of users.

Currently the two supported platforms are Telegram and Discord

## Dependencies

We use [TDLib](https://core.telegram.org/tdlib/) to look up Telegram usernames, so it needs to be installed.\
See [the build instructions](https://tdlib.github.io/td/build.html?language=Rust) for a guide on how to install.

**Important:** Right now, `rust_tdlib` only works with TDLib version 1.8.0 ([issue](https://github.com/antonio-antuan/rust-tdlib/issues/29)), so replace
```
git clone https://github.com/tdlib/td.git
```
with
```
git clone --depth 1 --branch v1.8.0 https://github.com/tdlib/td.git
```

## API

### GET ``/verifications/{platform}/{userId}``

Repsonds with a list of `Verification`s in JSON.

Example response:
```
[
    {
        "platform": "Telegram",
        "username": "TelegramUsername",
        "revoked": false
    },
    {
        "platform": "Discord",
        "username": "DiscordUsername#1234",
        "revoked": false
    }
]
```