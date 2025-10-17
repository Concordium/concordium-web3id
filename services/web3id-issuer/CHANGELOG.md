## Unreleased changes

- Dropped `concordium-rust-sdk` dependency's version requirement to allow pre-release SDK versions.
- Updated the `concordium-rust-sdk` dependency and adjusted project to be forward-compatible.
- Bumped the `concordium rust-sdk` dependency for the protocol 9 release.
- Bumped the `concordium-rust-sdk` dependency for the protocol 8 release.
- Bumped the `concordium-rust-sdk` dependency for the protocol 7 release.

## 0.3.2

- Fix a bug where the state of the server could become inconsistent if a client cancelled a request while the server was waiting for response from the node.

## 0.3.1

- Fix date-time attribute support by changing epoch to `-262144-01-01T00:00:00Z` from Unix epoch.

## 0.3.0

- Support date-time attributes.
- Added graceful shutdown

## 0.2.0

- Support the revised notion of credentials.

## 0.1.0

- Initial version
