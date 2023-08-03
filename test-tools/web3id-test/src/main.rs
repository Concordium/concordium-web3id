use anyhow::Context;
use clap::Parser;
use concordium_rust_sdk::{
    cis4::{
        Cis4Contract, Cis4TransactionMetadata, CredentialEvent, CredentialInfo, CredentialType,
        MetadataUrl,
    },
    common::{self, types::TransactionTime},
    contract_client::{IssuerKey, RevocationKey, SchemaRef},
    id::{constants::ArCurve, pedersen_commitment},
    smart_contracts::common::{self as concordium_std, AccountAddress, Amount, Timestamp},
    types::{
        smart_contracts::{ModuleReference, OwnedContractName, OwnedParameter},
        transactions::{
            send::{self, GivenEnergy},
            InitContractPayload,
        },
        ContractAddress, WalletAccount,
    },
    v2::{self, BlockIdentifier},
    web3id::{
        did::{IdentifierType, Method, Network},
        CredentialHolderId, Request, SignedCommitments, Web3IdAttribute, Web3IdCredential,
    },
};
use key_derivation::{ConcordiumHdWallet, Net};
use rand::{thread_rng, Rng};
use std::{collections::BTreeMap, path::PathBuf};
use web3id_issuer::{CredentialSubject, IssueRequest, IssueResponse};

#[derive(concordium_std::Serial)]
pub struct InitParams {
    /// The issuer's metadata.
    pub issuer_metadata: MetadataUrl,
    /// Credential type
    pub credential_type: CredentialType,
    pub schema:          SchemaRef,
    /// The issuer for the registry. If `None`, the `init_origin` is used as
    /// `issuer`.
    pub issuer:          Option<AccountAddress>,
    /// The public key of the issuer.
    pub issuer_key:      IssuerKey,
    /// Revocation keys available right after initialization.
    #[concordium(size_length = 1)]
    pub revocation_keys: Vec<RevocationKey>,
}

#[derive(Debug, clap::Subcommand)]
enum Action {
    #[clap(
        name = "new-issuer",
        about = "Create a new issuer smart contract instance."
    )]
    NewIssuer {
        #[clap(long = "metadata-url", help = "The credential's metadat URL.")]
        metadata_url:    String,
        #[clap(long = "credential-type", help = "The credential type.")]
        credential_type: String,
        #[clap(
            long = "schema-ref",
            help = "The schema belonging to the credential type."
        )]
        schema_ref:      String,
        #[clap(long = "issuer")]
        issuer:          Option<AccountAddress>,
        #[clap(long = "wallet")]
        wallet:          PathBuf,
        #[clap(long = "revocation-key", help = "A revocation key to register.")]
        revocation_keys: Vec<RevocationKey>,
        #[clap(
            long = "module",
            help = "The source module from which to initialize.",
            default_value = "5b58fde5766cecf481288a971b5f0f3391af736b41ddc806364713e602d82d2b"
        )]
        mod_ref:         ModuleReference,
    },
    #[clap(
        name = "register",
        about = "Register a new credential in a credential registry."
    )]
    Register {
        #[clap(long = "registry")]
        /// Address of the registry contract.
        registry:         ContractAddress,
        #[clap(long = "attributes", help = "Path to the file with attributes.")]
        attributes:       PathBuf,
        #[clap(long = "seed", help = "The path to the seed phrase.")]
        seed:             PathBuf,
        #[clap(
            name = "issuer",
            long = "issuer",
            help = "The issuer's wallet.",
            required_unless_present = "issuer-service",
            requires = "issuer-key"
        )]
        issuer:           Option<PathBuf>,
        #[clap(
            name = "issuer-key",
            long = "issuer-key",
            help = "The issuer's key for signing commitments."
        )]
        issuer_key:       Option<PathBuf>,
        #[clap(
            name = "issuer-service",
            long = "issuer-service",
            help = "The URL of the issuer servicexs.",
            required_unless_present = "issuer"
        )]
        issuer_service:   Option<reqwest::Url>,
        #[clap(long = "metadata-url", help = "The credential's metadata URL.")]
        metadata_url:     String,
        #[clap(
            long = "holder-revocable",
            help = "Whether the credential should be holder revocable."
        )]
        holder_revocable: bool,
        #[clap(
            long = "valid-from",
            help = "Timestamp when the credential starts being valid.",
            default_value_t = chrono::Utc::now()
        )]
        valid_from:       chrono::DateTime<chrono::Utc>,
        #[clap(
            long = "valid-until",
            help = "Timestamp when the credential stops being valid."
        )]
        valid_until:      Option<chrono::DateTime<chrono::Utc>>,
    },
    #[clap(name = "view", about = "View the credentials in a given contract.")]
    View {
        #[clap(long = "registry")]
        /// Address of the registry contract.
        registry: ContractAddress,
        #[clap(long = "seed", help = "The path to the seed phrase.")]
        seed:     PathBuf,
        #[clap(long = "index", help = "The index of the credential.")]
        index:    u32,
    },
    #[clap(
        name = "prove",
        about = "Construct a proof based on the stored credential and the statement."
    )]
    Prove {
        #[clap(
            long = "verifier",
            help = "URL of the verifier where to submit the presentation.",
            default_value = "https://web3id-verifier.testnet.concordium.com/v0/verify"
        )]
        verifier:   url::Url,
        #[clap(long = "credential", help = "The stored credential.")]
        credential: PathBuf,
        #[clap(long = "seed", help = "The path to the seed phrase.")]
        seed:       PathBuf,
        #[clap(long = "statement", help = "Path to the credential.")]
        statement:  PathBuf,
    },
}

#[derive(clap::Parser, Debug)]
#[command(author, version, about)]
#[command(propagate_version = true)]
struct App {
    #[clap(
        long = "node",
        help = "GRPC V2 interface of the node.",
        default_value = "http://node.testnet.concordium.com:20000",
        global = true
    )]
    endpoint: v2::Endpoint,
    #[command(subcommand)]
    action:   Action,
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    let app: App = App::parse();
    // TODO: TLS
    let endpoint = app
        .endpoint
        .connect_timeout(std::time::Duration::from_secs(5));
    let mut client = v2::Client::new(endpoint)
        .await
        .context("Unable to connect to the node.")?;

    match app.action {
        Action::NewIssuer {
            metadata_url,
            credential_type,
            schema_ref,
            issuer,
            wallet,
            revocation_keys,
            mod_ref,
        } => {
            let wallet = WalletAccount::from_json_file(wallet).context("Unable to read wallet.")?;
            let issuer_keypair = common::types::KeyPair::generate(&mut rand::thread_rng());
            let init_params = InitParams {
                issuer_metadata: MetadataUrl::new(metadata_url, None)?,
                issuer,
                revocation_keys,
                credential_type: CredentialType { credential_type },
                schema: SchemaRef {
                    schema_ref: MetadataUrl::new(schema_ref, None)
                        .context("Schema reference too large.")?,
                },
                issuer_key: issuer_keypair.public.into(),
            };
            let nonce = client
                .get_next_account_sequence_number(&wallet.address)
                .await?;
            anyhow::ensure!(
                nonce.all_final,
                "Not all transactions from the sender are finalized."
            );
            let payload = InitContractPayload {
                amount: Amount::zero(),
                mod_ref,
                init_name: OwnedContractName::new_unchecked("init_credential_registry".into()),
                param: OwnedParameter::from_serial(&init_params)?,
            };
            let tx = send::init_contract(
                &wallet,
                wallet.address,
                nonce.nonce,
                TransactionTime::hours_after(2),
                payload,
                10_000.into(),
            );
            let hash = client.send_account_transaction(tx).await?;
            println!("Sent transaction with hash {hash}. Waiting for finalization. DO NOT CANCEL.");
            let (bh, response) = client.wait_until_finalized(&hash).await?;
            println!("Transaction finalized in block {bh}");
            if let Some(r) = response.contract_init() {
                println!(
                    "Initialized new contract instance at address {} with name {}.",
                    r.address,
                    r.init_name.as_contract_name().contract_name()
                );
                let issuer_keys_out = format!("issuer-{}-keys.json", r.address.index);
                std::fs::write(
                    &issuer_keys_out,
                    serde_json::to_string_pretty(&issuer_keypair)?,
                )?;
                println!("Issuer's keys written to {issuer_keys_out}.");
            } else {
                println!("{:?}", response);
            }
        }
        Action::Prove {
            verifier,
            statement,
            seed,
            credential,
        } => {
            let wallet = std::fs::read_to_string(&seed).context("Unable to read seed phrase.")?;
            let wallet = ConcordiumHdWallet::from_seed_phrase(wallet.as_str(), Net::Testnet);

            let credential: Web3IdCredential<ArCurve, Web3IdAttribute> = serde_json::from_reader(
                std::fs::File::open(&credential).context("Unable to open credential.")?,
            )
            .context("Unable to parse credential.")?;

            // Find the index used for this credential.
            let Some(index) = (0u32..).find(
                |idx| wallet.get_verifiable_credential_public_key(credential.registry, *idx).unwrap() == credential.holder_id.public_key
            ) else {
                anyhow::bail!("Could not find credential index.");
            };

            let sec_key =
                wallet.get_verifiable_credential_signing_key(credential.registry, index)?;
            let holder_id = credential.holder_id;

            let mut registry = Cis4Contract::create(client.clone(), credential.registry).await?;

            let registry_metadata = registry
                .registry_metadata(BlockIdentifier::LastFinal)
                .await?;

            let statement = serde_json::from_reader(
                std::fs::File::open(&statement).context("Unable to open statement.")?,
            )
            .context("Unable to parse statement.")?;

            let statement = concordium_rust_sdk::web3id::CredentialStatement::Web3Id::<
                ArCurve,
                Web3IdAttribute,
            > {
                ty: [
                    "VerifiableCredential".into(),
                    "ConcordiumVerifiableCredential".into(),
                    registry_metadata.credential_type.credential_type,
                ]
                .into_iter()
                .collect(),
                network: concordium_rust_sdk::web3id::did::Network::Testnet,
                contract: credential.registry,
                credential: holder_id,
                statement,
            };
            let request = Request {
                challenge:             thread_rng().gen::<[u8; 32]>().into(),
                credential_statements: vec![statement],
            };
            let gc = client
                .get_cryptographic_parameters(BlockIdentifier::LastFinal)
                .await?;

            let secrets = credential.into_inputs(&sec_key);

            let start = chrono::Utc::now();
            let proof = request
                .prove(&gc.response, std::iter::once(secrets))
                .context("Cannot produce proof.")?;
            let end = chrono::Utc::now();
            println!(
                "Took {}ms to produce proof.",
                end.signed_duration_since(start).num_milliseconds()
            );

            let network_client = reqwest::ClientBuilder::new()
                .connect_timeout(std::time::Duration::from_secs(5))
                .timeout(std::time::Duration::from_secs(10))
                .build()?;

            let start = chrono::Utc::now();
            let response = network_client.post(verifier).json(&proof).send().await?;
            let end = chrono::Utc::now();
            println!(
                "Took {}ms to get proof verified.",
                end.signed_duration_since(start).num_milliseconds()
            );

            if response.status().is_success() {
                let body: serde_json::Value = response.json().await?;
                println!("{}", serde_json::to_string_pretty(&body)?);
            } else {
                println!("Verification failed.");
            }
        }
        Action::View {
            registry,
            seed,
            index,
        } => {
            let bi = client.get_consensus_info().await?.last_finalized_block;
            let mut registry_contract = Cis4Contract::create(client.clone(), registry)
                .await
                .context("Unable to construct registry contract.")?;
            let wallet = std::fs::read_to_string(&seed).context("Unable to read seed phrase.")?;
            let wallet = ConcordiumHdWallet::from_seed_phrase(wallet.as_str(), Net::Testnet);
            let pk = wallet.get_verifiable_credential_public_key(registry, index)?;
            let holder = CredentialHolderId::new(pk);
            let entry = registry_contract
                .credential_entry(holder, bi)
                .await
                .context("Unable to get credential entry")?;
            let status = registry_contract
                .credential_status(holder, bi)
                .await
                .context("Unable to get credential status")?;

            println!("Entry: {entry:#?}");

            println!("Status: {status:#?}");
        }
        Action::Register {
            registry,
            attributes,
            seed,
            issuer,
            issuer_key,
            issuer_service,
            metadata_url,
            holder_revocable,
            valid_until,
            valid_from,
        } => {
            let wallet = std::fs::read_to_string(&seed).context("Unable to read seed phrase.")?;
            let wallet = ConcordiumHdWallet::from_seed_phrase(wallet.as_str(), Net::Testnet);

            let mut registry_contract = Cis4Contract::create(client.clone(), registry)
                .await
                .context("Unable to construct registry contract.")?;

            let mut idx = 0;
            loop {
                let pk = wallet.get_verifiable_credential_public_key(registry, idx)?;
                let resp = registry_contract
                    .credential_entry(CredentialHolderId::new(pk), BlockIdentifier::LastFinal)
                    .await;
                if let Err(e) = resp {
                    if e.is_contract_error().is_some() {
                        break;
                    } else {
                        anyhow::bail!("Error querying the node: {e:?}")
                    }
                } else {
                    idx += 1;
                }
            }
            println!("Using index = {}", idx);
            let pub_key = wallet.get_verifiable_credential_public_key(registry, idx)?;

            let values: BTreeMap<String, Web3IdAttribute> =
                serde_json::from_reader(&std::fs::File::open(&attributes)?)
                    .context("Unable to read attributes.")?;

            let crypto_params = client
                .get_cryptographic_parameters(BlockIdentifier::LastFinal)
                .await?
                .response;
            let mut rng = rand::thread_rng();

            let cred_info = {
                let valid_from =
                    Timestamp::from_timestamp_millis(valid_from.timestamp_millis() as u64);

                let valid_until = valid_until
                    .map(|ts| Timestamp::from_timestamp_millis(ts.timestamp_millis() as u64));

                CredentialInfo {
                    holder_id: CredentialHolderId::new(pub_key),
                    holder_revocable,
                    valid_from,
                    valid_until,
                    metadata_url: MetadataUrl::new(metadata_url.clone(), None)?,
                }
            };

            let expiry = TransactionTime::hours_after(2);

            let register_response = if let Some(issuer) = issuer {
                let mut randomness = BTreeMap::new();
                for idx in values.keys() {
                    randomness.insert(
                        idx.clone(),
                        pedersen_commitment::Randomness::generate(&mut rng),
                    );
                }
                let issuer_signer: common::types::KeyPair =
                    serde_json::from_reader(&std::fs::File::open(
                        &issuer_key.context("Expected issuer key if local issuer is set.")?,
                    )?)
                    .context("Unable to read attributes.")?;
                let signed_commitments = SignedCommitments::from_secrets(
                    &crypto_params,
                    &values,
                    &randomness,
                    &pub_key.into(),
                    &issuer_signer,
                    registry_contract.address,
                )
                .context("Unable to produce commitments.")?;

                let issuer_metadata = registry_contract
                    .registry_metadata(BlockIdentifier::LastFinal)
                    .await?;

                let secrets = Web3IdCredential {
                    registry,
                    issuer_key: issuer_signer.public.into(),
                    values,
                    randomness,
                    signature: signed_commitments.signature,
                    holder_id: cred_info.holder_id,
                    network: Network::Testnet, // TODO
                    credential_type: [
                        "VerifiableCredential".into(),
                        "ConcordiumVerifiableCredential".into(),
                        issuer_metadata.credential_type.credential_type,
                    ]
                    .into_iter()
                    .collect(),
                    credential_schema: issuer_metadata.credential_schema.schema_ref.url().into(),
                    valid_from,
                    valid_until,
                };

                let issuer = WalletAccount::from_json_file(&issuer)
                    .context("Unable to get issuer's wallet.")?;
                let metadata = Cis4TransactionMetadata {
                    sender_address: issuer.address,
                    nonce: client
                        .get_next_account_sequence_number(&issuer.address)
                        .await?
                        .nonce,
                    expiry,
                    energy: GivenEnergy::Add(10_000.into()),
                    amount: Amount::zero(),
                };
                let secrets_string = serde_json::to_string_pretty(&secrets)?;
                let secrets_out_path = format!("{}.json", cred_info.holder_id);
                std::fs::write(&secrets_out_path, secrets_string)?;
                println!("Credential secrets are written to {secrets_out_path}");
                registry_contract
                    .register_credential(&issuer, &metadata, &cred_info, &[])
                    .await
                    .context("Unable to register.")?
            } else if let Some(url) = issuer_service {
                let network_client = reqwest::ClientBuilder::new()
                    .connect_timeout(std::time::Duration::from_secs(5))
                    .timeout(std::time::Duration::from_secs(10))
                    .build()?;
                let body = IssueRequest {
                    valid_from,
                    valid_until,
                    holder_revocable,
                    credential_subject: CredentialSubject {
                        id:         Method {
                            network: Network::Testnet,
                            ty:      IdentifierType::PublicKey { key: pub_key },
                        },
                        attributes: values,
                    },
                    metadata_url: MetadataUrl::new_unchecked(metadata_url, None),
                };

                let response = network_client.post(url).json(&body).send().await?;
                if response.status().is_success() {
                    let IssueResponse {
                        tx_hash,
                        credential,
                    } = response.json::<IssueResponse>().await?;
                    let secrets_string = serde_json::to_string_pretty(&credential)?;
                    let secrets_out_path = format!("{}.json", cred_info.holder_id);
                    std::fs::write(&secrets_out_path, secrets_string)?;
                    println!("Credential secrets are written to {secrets_out_path}");
                    tx_hash
                } else {
                    anyhow::bail!("Failed to issue: {response:#?}");
                }
            } else {
                anyhow::bail!("Either issuer or issuer-service must be present.")
            };

            println!("Submitted register transaction with hash {register_response}");
            let (bh, result) = client.wait_until_finalized(&register_response).await?;
            println!("The transaction is finalized in block {bh}.");
            if let Some(events) = result.contract_update_logs() {
                println!("Credential registered.");
                for (ca, events) in events {
                    if ca == registry {
                        for event in events {
                            if let Ok(event) = CredentialEvent::try_from(event) {
                                println!("{event:#?}");
                            } else {
                                println!("Could not deserialize event: {event:#?}");
                            }
                        }
                    }
                }
            } else {
                println!(
                    "Register failed: {:#?}",
                    result.is_rejected_account_transaction().context(
                        "Not a contract update, but also not rejected. Something is very wrong."
                    )?
                );
            }
            drop(result); // make sure that result is not dropped prematurely.
        }
    }

    Ok(())
}
