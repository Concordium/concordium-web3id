use anyhow::Context;
use clap::Parser;
use concordium_rust_sdk::{
    cis4::{
        Cis4Contract, Cis4TransactionMetadata, CredentialEvent, CredentialInfo, CredentialType,
        MetadataUrl,
    },
    common::types::TransactionTime,
    contract_client::{RevocationKey, SchemaRef},
    id::{
        constants::ArCurve, curve_arithmetic::Curve, pedersen_commitment::VecCommitmentKey,
        types::Attribute,
    },
    smart_contracts::common::{self as concordium_std, AccountAddress, Amount, Timestamp},
    types::{
        hashes::TransactionHash,
        smart_contracts::{ModuleReference, OwnedContractName, OwnedParameter},
        transactions::{
            send::{self, GivenEnergy},
            InitContractPayload,
        },
        ContractAddress, WalletAccount,
    },
    v2::{self, BlockIdentifier},
    web3id::{
        storage::{CredentialSecrets, CredentialStorageContract, DataToSign},
        CommitmentInputs, CredentialHolderId, Request, Web3IdAttribute,
    },
};
use ed25519_dalek::Keypair;
use key_derivation::{ConcordiumHdWallet, Net};
use rand::{thread_rng, Rng};
use std::{collections::BTreeMap, path::PathBuf};

#[derive(concordium_std::Serial)]
pub struct InitParams {
    /// The issuer's metadata.
    pub issuer_metadata: MetadataUrl,
    /// An address of the credential storage contract.
    pub storage_address: ContractAddress,
    /// Credential schemas available right after initialization.
    #[concordium(size_length = 1)]
    pub schemas:         Vec<(CredentialType, SchemaRef)>,
    /// The issuer for the registry. If `None`, the `init_origin` is used as
    /// `issuer`.
    pub issuer:          Option<AccountAddress>,
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
        metadata_url:     String,
        #[clap(long = "credential-type", help = "The credential type.")]
        credential_types: Vec<String>,
        #[clap(
            long = "schema-ref",
            help = "The schema belonging to the credential type."
        )]
        schema_refs:      Vec<String>,
        #[clap(long = "storage", default_value_t=ContractAddress::new(4732,0))]
        storage:          ContractAddress,
        #[clap(long = "issuer")]
        issuer:           Option<AccountAddress>,
        #[clap(long = "wallet")]
        wallet:           PathBuf,
        #[clap(long = "revocation-key", help = "A revocation key to register.")]
        revocation_keys:  Vec<RevocationKey>,
        #[clap(
            long = "module",
            help = "The source module from which to initialize.",
            default_value = "20c145580805cc1215bf11cb1472fa61ae61bd74d4a06a6e3265ba206c9fce27"
        )]
        mod_ref:          ModuleReference,
    },
    #[clap(
        name = "register",
        about = "Register a new credential in a credential registry."
    )]
    Register {
        #[clap(long = "registry")]
        /// Address of the registry contract.
        registry:         ContractAddress,
        /// Address of the storage contract.
        #[clap(long = "storage", default_value_t=ContractAddress::new(4732,0))]
        storage:          ContractAddress,
        #[clap(long = "attributes", help = "Path to the file with attributes.")]
        attributes:       PathBuf,
        #[clap(long = "seed", help = "The path to the seed phrase.")]
        seed:             PathBuf,
        #[clap(
            name = "issuer",
            long = "issuer",
            help = "The issuer's wallet.",
            required_unless_present = "issuer-service"
        )]
        issuer:           Option<PathBuf>,
        #[clap(
            name = "issuer-service",
            long = "issuer-service",
            help = "The URL of the issuer servicexs.",
            required_unless_present = "issuer"
        )]
        issuer_service:   Option<reqwest::Url>,
        #[clap(long = "credential-type", help = "The credential type.")]
        credential_type:  String,
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
            help = "URL of the verifier where to submit the presentation."
        )]
        verifier:  url::Url,
        #[clap(long = "index", help = "The index of the credential.")]
        index:     u32,
        #[clap(long = "storage", default_value_t=ContractAddress::new(4732,0))]
        storage:   ContractAddress,
        #[clap(long = "seed", help = "The path to the seed phrase.")]
        seed:      PathBuf,
        #[clap(long = "statement", help = "Path to the credential.")]
        statement: PathBuf,
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
            credential_types,
            schema_refs,
            storage,
            issuer,
            wallet,
            revocation_keys,
            mod_ref,
        } => {
            let wallet = WalletAccount::from_json_file(wallet).context("Unable to read wallet.")?;
            anyhow::ensure!(
                credential_types.len() == schema_refs.len(),
                "Inconsistent number of credential types and schemas."
            );
            let schemas = credential_types
                .into_iter()
                .map(|credential_type| CredentialType { credential_type })
                .zip(schema_refs.into_iter().map(|url| SchemaRef {
                    schema_ref: MetadataUrl::new(url, None).unwrap(),
                }))
                .collect::<Vec<_>>();
            let init_params = InitParams {
                issuer_metadata: MetadataUrl::new(metadata_url, None)?,
                storage_address: storage,
                schemas,
                issuer,
                revocation_keys,
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
            println!("Sent transaction with hash {hash}.");
            let (bh, response) = client.wait_until_finalized(&hash).await?;
            println!("Transaction finalized in block {bh}");
            if let Some(r) = response.contract_init() {
                println!(
                    "Initialized new contract instance at address {} with name {}.",
                    r.address,
                    r.init_name.as_contract_name().contract_name()
                );
            } else {
                println!("{:?}", response);
            }
        }
        Action::Prove {
            verifier,
            statement,
            index,
            seed,
            storage,
        } => {
            let wallet = std::fs::read_to_string(&seed).context("Unable to read seed phrase.")?;
            let wallet = ConcordiumHdWallet::from_seed_phrase(wallet.as_str(), Net::Testnet);

            let sec_key = wallet.get_verifiable_credential_signing_key(index)?;
            let pub_key = wallet.get_verifiable_credential_public_key(index)?;
            let enc_key = wallet.get_verifiable_credential_encryption_key(index)?;
            let mut storage_client = CredentialStorageContract::create(client.clone(), storage)
                .await
                .context("Unable to construct storage client.")?;

            let holder_id = CredentialHolderId::new(pub_key);

            let Some(resp) = storage_client.get_credential_secrets(&holder_id, BlockIdentifier::LastFinal).await? else {
                    anyhow::bail!("Unable to retrieve credential with index {index} from the storage contract.")
            };
            let data = resp.decrypt(pub_key.into(), enc_key)?;

            let mut registry = Cis4Contract::create(client.clone(), data.issuer).await?;

            let info = registry
                .credential_entry(holder_id, BlockIdentifier::LastFinal)
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
                    info.credential_info.credential_type.credential_type,
                ]
                .into_iter()
                .collect(),
                network: concordium_rust_sdk::web3id::did::Network::Testnet,
                contract: data.issuer,
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

            let secrets = CommitmentInputs::Web3Issuer {
                issuance_date: info.credential_info.valid_from.try_into()?,
                signer:        &sec_key,
                values:        &data.values,
                randomness:    data.randomness,
            };

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
            let pk = wallet.get_verifiable_credential_public_key(index)?;
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
            storage,
            attributes,
            seed,
            issuer,
            issuer_service,
            metadata_url,
            credential_type,
            holder_revocable,
            valid_until,
            valid_from,
        } => {
            let wallet = std::fs::read_to_string(&seed).context("Unable to read seed phrase.")?;
            let wallet = ConcordiumHdWallet::from_seed_phrase(wallet.as_str(), Net::Testnet);

            let mut storage_client = CredentialStorageContract::create(client.clone(), storage)
                .await
                .context("Unable to construct storage client.")?;

            let mut idx = 0;
            loop {
                let pk = wallet.get_verifiable_credential_public_key(idx)?;
                let resp = storage_client
                    .get_credential_secrets(
                        &CredentialHolderId::new(pk),
                        BlockIdentifier::LastFinal,
                    )
                    .await?;
                if resp.is_none() {
                    break;
                } else {
                    idx += 1;
                }
            }
            println!("Using index = {}", idx);
            let sec_key = wallet.get_verifiable_credential_signing_key(idx)?;
            let pub_key = wallet.get_verifiable_credential_public_key(idx)?;
            let enc_key = wallet.get_verifiable_credential_encryption_key(idx)?;

            let mut registry_contract = Cis4Contract::create(client.clone(), registry)
                .await
                .context("Unable to construct registry contract.")?;

            let values: BTreeMap<u8, Web3IdAttribute> =
                serde_json::from_reader(&std::fs::File::open(&attributes)?)
                    .context("Unable to read attributes.")?;

            let crypto_params = client
                .get_cryptographic_parameters(BlockIdentifier::LastFinal)
                .await?;
            let (&h, _, bases) = crypto_params.response.vector_commitment_base();
            let comm_key = VecCommitmentKey {
                gs: bases.copied().collect(),
                h,
            };
            let mut gapped_values = Vec::new();
            for (k, v) in values.iter() {
                for _ in gapped_values.len()..usize::from(*k) {
                    gapped_values.push(ArCurve::scalar_from_u64(0));
                }
                gapped_values.push(v.to_field_element());
            }
            let mut rng = rand::thread_rng();
            let (comm, randomness) = comm_key
                .commit(&gapped_values, &mut rng)
                .context("Unable to commit.")?;

            let valid_from = Timestamp::from_timestamp_millis(valid_from.timestamp_millis() as u64);

            let valid_until = valid_until
                .map(|ts| Timestamp::from_timestamp_millis(ts.timestamp_millis() as u64));

            let cred_info = CredentialInfo {
                holder_id: CredentialHolderId::new(pub_key),
                holder_revocable,
                commitment: concordium_rust_sdk::common::to_bytes(&comm),
                valid_from,
                valid_until,
                credential_type: CredentialType { credential_type },
                metadata_url: MetadataUrl::new(metadata_url, None)?,
            };
            let nonce: [u8; 12] = rng.gen();

            let secrets = CredentialSecrets {
                randomness,
                values,
                issuer: registry,
            };
            let expiry = TransactionTime::hours_after(2);
            let encrypted_secrets = secrets.encrypt(cred_info.holder_id, enc_key, nonce)?;
            let payload_to_sign = DataToSign {
                contract_address:     storage_client.address,
                encrypted_credential: concordium_std::to_bytes(&encrypted_secrets),
                version:              0,
                timestamp:            Timestamp::from_timestamp_millis(expiry.seconds * 1000),
            };
            let kp = Keypair {
                secret: sec_key,
                public: pub_key,
            };
            let store_params = payload_to_sign.sign(&kp);
            let storage_data = concordium_std::to_bytes(&store_params);

            let register_response = if let Some(issuer) = issuer {
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
                registry_contract
                    .register_credential(&issuer, &metadata, &cred_info, &storage_data)
                    .await
                    .context("Unable to register.")?
            } else if let Some(url) = issuer_service {
                let network_client = reqwest::ClientBuilder::new()
                    .connect_timeout(std::time::Duration::from_secs(5))
                    .timeout(std::time::Duration::from_secs(10))
                    .build()?;
                let body = serde_json::json!({
                    "credential": cred_info,
                    "signature": hex::encode(store_params.signature),
                    "data": store_params.data,
                });
                let response = network_client.post(url).json(&body).send().await?;
                if response.status().is_success() {
                    response.json::<TransactionHash>().await?
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
