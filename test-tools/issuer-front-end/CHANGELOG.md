## Unreleased changes

## 1.0.11

- Update module reference for the credential registry contract.

## 1.0.10

- Support new date-time format for browser wallet 1.1.6.
- Allow sending attributes where the attribute type is not recognized.

## 1.0.9

- Change to use a hexString for the auxiliary data.
- Support 'integer' type in the schema.

## 1.0.8

- Add support for date-time attributes.

## 1.0.7

- Add `console.debug` whenever the front end sends data to the wallet or the backend.
- Replace placeholder attribute at the input fields with the value of the `useState` hook that tracks this field.
- Remove checks if input field values are set.
- Input field ids are now unique.

## 1.0.6

- Use credentialType and credentialSchema fetched from the smart contract instance.

## 1.0.5

- Add support for optional attributes.
- Credential schema is only loaded from the contract instance.

## 1.0.4

- Add test case to restore credential.

## 1.0.3

- Add test case to update `issuerMetadata`.
- Add test case to update `credentialMetadata`.
- Add test case to update `credentialSchema`.

## 1.0.2

- Use `EXAMPLE_CREDENTIAL_SCHEMA` when associated input field is left empty in step 1.

## 1.0.1

- Make the issuer compatible with the latest 1.1.0 wallet.

## 1.0.0

- Initial issuer front end.
