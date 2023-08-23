# SoMe Web3 ID Verifier dApp and API

Checks social media credentials issued by the SoMe Web3 ID Issuer.
Also serves an API to the social media bots, where they can query they verification status of users.

Currently the two supported platforms are Telegram and Discord.

## API

### GET `/verifications/{platform}/{userId}`

Responds with a list of `Accounts`s and an optional `FullName` in JSON.

Example response:

```
{
    "accounts": [
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
    ],
    "full_name": {
        "first_name": "John",
        "last_name": "Doe"
    }
}
```
