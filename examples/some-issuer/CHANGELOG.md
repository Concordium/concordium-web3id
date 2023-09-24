## Unreleased changes

## Telegram/Discord 1.0.1

- Add an option to start a prometheus server with basic request metrics (response
  time, response status, endpoint).
- Change how transactions are being sent to avoid problems with nonce tracking.
  This fixes an issue where if a user cancelled a request at the right time
  (e.g., by refreshing their page at just the right time) it might lead to the
  nonce tracked by the service to be out of sync with the real account nonce.
- If the service fails to submit a transaction due to InvalidArgument error
  it will terminate.

## Telegram/Discord 1.0.0

- Initial issuer.
