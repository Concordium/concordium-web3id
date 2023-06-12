## A tool for testing web3id interactions

This tool allows for testing
- deployment of new issuers assuming that they conform to the example credential
  registry contract API for the `init` function.
- issuing new credentials as an issuer
- creating proofs based on existing web3id credentials
- viewing credentials

The tool is organized around subcommands.

Commands:
  - `new-issuer`
  - `register`
  - `view`
  - `prove`

## Design of the tool.

The tool is designed to automatically retrieve credentials from the chain when proving.
It does this based on a provided seedphrase and index which is the same index used by wallets to generate the relevant web3id keys.
For issuing the index is discovered automatically by looking up in the storage contract.

Some commands, such as `register` need attributes of a credential to be provided.
An example of a JSON file that can be used is
```json
{
    "0": "foo",
    "3": 3
}
```

which states that attribute at tag `0` should have a string value `foo` and attribute at tag `3`
should have attribute integer value `3`.

Similarly, the `prove` command requires a statement to be proved. An example is
```json
[
  {
    "attributeTag": 0,
    "type": "AttributeInSet",
    "set": ["foo", "bar", "baz", "qux"]
  },
  {
    "attributeTag": 3,
    "lower": 0,
    "upper": 17,
    "type": "AttributeInRange"
  }
]
```

Currently the limitation of the tool is that it can only request proofs of statements about a single
credential.


### Examples

- Register a new credential in the contract at index 4734 using the credential
issuer service.

```
web3id-test register --registry '<4734,0>' --attributes attributes.json --seed seedphrase.txt --node 'http://node.testnet.concordium.com:20000' --metadata-url 'http:://credential-metadaata.ccd' --credential-type Foo --issuer-service 'http://localhost:9000/v0/issue'
```

- Register credential as above, but by directly using the node.

```
web3id-test register --registry '<4734,0>' --attributes attributes.json --seed seedphrase.txt --node 'http://node.testnet.concordium.com:20000' --metadata-url 'http:://credential-metadaata.ccd' --credential-type Foo --issuer wallet.export
```
where `wallet.export` is the wallet export file of the issuer's account.

- Create a new issuer

```
web3id-test --node http://node.testnet.concordium.com:20000 new-issuer --metadata-url http://issuer-metadata-url.com --wallet wallet.export --credential-type Foo --schema-ref http://foo-schema-url.com
```

- Construct a proof based on an existing credential.

```
web3id-test prove --storage '<4666,0>' --seed seedphrase.txt --node http://node.testnet.concordium.com:20000 --verifier http://localhost:8100/web3id/prove --index 0 --statement statement.json
```

## Build

To build make sure the Rust SDK is checked out at the correct submodule

```
git submodule update --init --recursive
```

Then run `cargo build --release` in this directory. That will produce a binary `web3id-test` in the `target/release`.
