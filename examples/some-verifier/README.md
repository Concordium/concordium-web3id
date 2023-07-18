# SoMe Web3 ID Verifier dApp and API

Checks social media credentials issued by the SoMe Web3 ID Issuer.\
Also serves an API to the social media bots, where they can query they verification status of users.

Currently the two supported platforms are Telegram and Discord

## API

### GET ``/verifications/{platform}/{id}``

Repsonds with a list of `Verification`s in JSON, e.g. GET `/verifications/telegram/12345678`, where 12345678 is someone's Telegram user ID could respond
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