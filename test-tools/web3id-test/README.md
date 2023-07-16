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

The tool tries to as much as possible get the data from the chain. For example
it'll determine the holder id it should use based on existing credentials in the
registry contract.

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
web3id-test register --attributes attributes.json --seed seedphrase.txt --registry '<5441,0>' --metadata-url http:://credential-metadaata.ccd --issuer-service http://localhost:8100/v0/issue
```

- Register credential as above, but by directly using the node and issuer's keys.

```
web3id-test register --attributes attributes.json --seed seedphrase.txt --registry '<5441,0>' --metadata-url http:://credential-metadaata.ccd --issuer-key issuer-5441-keys.json --issuer wallet.export
```
where `wallet.export` is the wallet export file of the issuer's account.

Both of the above command will output a credential in a file named
`$holderId.json` where `$holderId` is the public key of the new credential's
holder.

- Create a new issuer

```
web3id-test new-issuer --metadata-url http://issuer-metadata-url.com --wallet wallet.export --credential-type Foo --schema-ref http://foo-schema-url.com
```

- Construct a proof based on an existing credential.

```
web3id-test prove --seed seedphrase.txt --verifier http://localhost:8080/v0/verify --credential 4e199d7fed03c1265677562ae48180179f2981d865ea81c0dedc16cfb94de75f.json --statement statement.json
```

## Build

To build make sure the Rust SDK is checked out at the correct submodule

```
git submodule update --init --recursive
```

Then run `cargo build --release` in this directory. That will produce a binary `web3id-test` in the `target/release`.
