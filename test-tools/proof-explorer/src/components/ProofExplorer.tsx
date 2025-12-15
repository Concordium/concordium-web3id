/* eslint-disable no-alert */
import { useEffect, useState, MouseEventHandler, ChangeEventHandler, useRef } from 'react';
import {
    AttributeKeyString,
    AtomicStatementV2,
    ConcordiumGRPCClient,
    streamToList,
    ContractAddress,
    VerificationRequestV1,
    TransactionHash,
} from '@concordium/web-sdk';
import { BrowserWalletProvider, WalletConnectProvider, WalletProvider } from '../services/wallet-connection';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { GRPC_WEB_CONFIG, ID_METHOD, ID_METHOD_V1, SIGN_AND_SEND_TRANSACTION } from '../constants';
import { version } from '../../package.json';
import { AccountStatement, IdentityCredentialStatement, TopLevelStatements, Web3IdStatement } from '../types';
import { IdentityProviders, Issuers, parseIssuers } from '../services/credential-provider-services';
import { SubmitProof } from '../services/verification-service';
import { Statement } from './statements/StatementDisplay';
import { AttributeInRange, AttributeInSet, RevealAttribute } from './statements/Web3IdStatementBuilders';
import { AgeBound, AgeInRange, AttributeIn, DocumentExpiryNoEarlier, DocumentIssuerIn, EUAttributeIn } from './statements/AccountStatementBuilders';
import { Toaster } from 'react-hot-toast';
import toast from "react-hot-toast";
import { handleSimulateAnchorCreation } from '../services/simulation-service';
import { SubmitProofV1 } from '../services/verification-service-v1';

const accountAttributeNames = Object.values(AttributeKeyString).map((ak) => {
    return { value: ak, label: ak };
});

/**
 * The main component.
 */
export default function ProofExplorer() {
    const [provider, setProvider] = useState<WalletProvider>();
    const [currentStatementType, setCurrentStatementType] = useState<'account' | 'id' | 'web3id' | undefined>(undefined);

    useEffect(() => {
        if (provider !== undefined) {
            return () => {
                provider?.disconnect?.().then(() => provider.removeAllListeners());
            };
        }
    }, [provider]);

    const [statement, setStatement] = useState<TopLevelStatements>([]);

    const client = useRef(new ConcordiumGRPCClient(new GrpcWebFetchTransport(GRPC_WEB_CONFIG)));

    const [idps, setIdps] = useState<{ name: string; id: number }[]>([]);

    useEffect(() => {
        streamToList(client.current.getIdentityProviders()).then((chainIdps) => {
            setIdps(
                chainIdps.map((idp) => {
                    return { name: idp.ipDescription.name, id: idp.ipIdentity };
                })
            );
        });
    }, []);

    const [checked, idpsDisplay] = IdentityProviders({ idps });

    const [idCred_checked, idCred_idpsDisplay] = IdentityProviders({ idps });

    const [lastAccount, setLastAccount] = useState<boolean>(true);

    const [new_statement, setNewStatement] = useState<boolean>(true);


    const addIdentityCredentialStatement = (a: AtomicStatementV2[]) => {
        if (currentStatementType && currentStatementType != 'id') {
            console.log("Warning: mixing statement types. Current type=", currentStatementType, ". Clear last credential statement first.");
            toast.error("Warning: mixing statement types. Clear last credential statement first.");
            return;
        }

        if (currentStatementType === undefined)
            setCurrentStatementType('id');

        setStatement((statements) => {
            console.log("Adding identity credential statement");

            if (!lastAccount || new_statement || statements.length == 0) {
                console.log("Creating new identity credential statement lastAccount=", lastAccount, " new_statement=", new_statement, " statements.length=", statements.length);
                setLastAccount(true);
                setNewStatement(false);
                const statement: IdentityCredentialStatement = {
                    idCred_idps: idps.filter(({ id }) => idCred_checked.includes(id)),
                    statement: a,
                };
                return [...statements, { type: 'id', statement: statement }];
            } else {
                statements[statements.length - 1].statement.statement =
                    statements[statements.length - 1].statement.statement.concat(a);
                return [...statements]; // copy the array to force component updates.
            }
        });
    };


    const addAccountStatement = (a: AtomicStatementV2[]) => {
        if (currentStatementType && currentStatementType != 'account') {
            console.log("Warning: mixing statement types. Current type=", currentStatementType, ". Clear last credential statement first.");
            toast.error("Warning: mixing statement types. Clear last credential statement first.");
            return;
        }

        if (currentStatementType === undefined) setCurrentStatementType('account');

        setStatement((statements) => {
            console.log("Adding account statement");
            if (!lastAccount || new_statement || statements.length == 0) {
                console.log("Creating new account statement lastAccount=", lastAccount, " new_statement=", new_statement, " statements.length=", statements.length);
                setLastAccount(true);
                setNewStatement(false);
                const statement: AccountStatement = {
                    idps: idps.filter(({ id }) => checked.includes(id)),
                    statement: a,
                };
                return [...statements, { type: 'account', statement: statement }];
            } else {
                statements[statements.length - 1].statement.statement =
                    statements[statements.length - 1].statement.statement.concat(a);
                return [...statements]; // copy the array to force component updates.
            }
        });
    };

    const [issuers, setIssuers] = useState<string>('');

    const addWeb3IdStatement = (a: AtomicStatementV2[]) => {

        if (currentStatementType && currentStatementType != 'web3id') {
            console.log("Warning: mixing statement types. Current type=", currentStatementType, ". Clear last credential statement first.");
            toast.error("Warning: mixing statement types. Clear last credential statement first.");
            return;
        }

        if (currentStatementType === undefined) setCurrentStatementType('web3id');


        setStatement((statements) => {
            if (lastAccount || new_statement || statements.length == 0) {
                setLastAccount(false);
                setNewStatement(false);
                const statement: Web3IdStatement = {
                    issuers: parseIssuers(issuers).map((i) => {
                        return ContractAddress.create(i, 0);
                    }),
                    statement: a,
                };
                return [...statements, { type: 'web3id', statement: statement }];
            } else {
                statements[statements.length - 1].statement.statement =
                    statements[statements.length - 1].statement.statement.concat(a);
                return [...statements]; // copy the array to force component updates.
            }
        });
    };

    const handleAddTopLevel: MouseEventHandler<HTMLButtonElement> = () => {
        setNewStatement(true);
    };

    const onIssuersChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setIssuers(e.target.value);
    };

    const [web3IdAttributes, issuersDisplay] = Issuers(issuers, client.current);

    const [setMessages, submitProofDisplay] = SubmitProof(statement, provider);

    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const context = VerificationRequestV1.createSimpleContext(nonce, 'Example Connection ID', 'Example Context String');
    const [transactionHash, setTransactionHash] = useState<TransactionHash.Type | undefined>(undefined);
    // TODO: remove and use above `transactionHash`
    const dummy_tx_hash:TransactionHash.Type=TransactionHash.fromHexString("a5858c7dd535c4ce0b2ce3f5554b9b765bdc1c464980cd08233dc86b882e7dd3");
    const [setMessagesV1, submitProofDisplayV1] = SubmitProofV1(statement, context, dummy_tx_hash, provider);

    const [simulationResult, setSimulationResult] = useState<string | null>(null);

    const runSimulation = async () => {
        if (!provider) {
            setSimulationResult('Please connect a browser wallet provider before running the simulation.');
            return;
        }
        setTransactionHash(undefined)

        try {
            const transactionHash = await handleSimulateAnchorCreation(provider, statement, context);
            setSimulationResult(`Simulation completed successfully with anchor transaction hash: ${transactionHash}`);
            setTransactionHash(TransactionHash.fromHexString(transactionHash))
        } catch (err) {
            console.error('Error during simulation:', err);
            setSimulationResult(`Error during simulation: ${err}`);
        }
    };

    return (
        <main className="container">
            <nav className="navbar bg-black mb-3 justify-content-between">
                <div className="container-fluid">
                    <a className="navbar-brand text-white" href="#">
                        {`Proof explorer ${version} `}
                    </a>
                    <a
                        className="navbar-text link-primary"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://github.com/Concordium/concordium-web3id/tree/main/test-tools/proof-explorer`}
                    >
                        (source code)
                    </a>
                </div>
            </nav>
            <div className="row">
                <Toaster
                    position="bottom-center"
                    reverseOrder={false}
                />
                <div className="col-sm">
                    <div className="bg-success mb-3 p-3 text-white">
                        {' '}
                        Construct a statement about a web3id credential.{' '}
                    </div>
                    <div className="bg-success mb-3 p-3 text-white">
                        <p> List of allowed issuers, e.g., 5916,5830 </p>
                        <input
                            className="my-1"
                            placeholder="5916,5830"
                            onChange={onIssuersChange}
                            value={issuers.toString()}
                        />
                        {issuersDisplay}
                    </div>
                    <div>
                        <RevealAttribute setStatement={addWeb3IdStatement} attributeOptions={web3IdAttributes} />
                    </div>
                    <div>
                        <AttributeInRange setStatement={addWeb3IdStatement} attributeOptions={web3IdAttributes} />
                    </div>
                    <div>
                        <AttributeInSet
                            member={true}
                            setStatement={addWeb3IdStatement}
                            attributeOptions={web3IdAttributes}
                        />
                    </div>
                    <div>
                        <AttributeInSet
                            member={false}
                            setStatement={addWeb3IdStatement}
                            attributeOptions={web3IdAttributes}
                        />
                    </div>
                </div>
                <div className="col-sm">
                    <div className="bg-black mb-3 p-3 text-white">
                        Construct a statement about an account credential
                    </div>
                    <div className="bg-black mb-3 p-3 text-white">
                        Select which identity providers to allow
                        {idpsDisplay}
                    </div>
                    <div>
                        <RevealAttribute setStatement={addAccountStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AgeBound younger={true} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AgeBound younger={false} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AgeInRange setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <DocumentExpiryNoEarlier setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <DocumentIssuerIn setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={true}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={false}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={true}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={false}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <EUAttributeIn nationality={true} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <EUAttributeIn nationality={false} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AttributeInRange setStatement={addAccountStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AttributeInSet
                            member={true}
                            setStatement={addAccountStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                    <div>
                        <AttributeInSet
                            member={false}
                            setStatement={addAccountStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                </div>


                <div className="col-sm">
                    <div className="bg-info mb-3 p-3 text-black">
                        Construct a statement about an identity credential below and then press Simulate Create Anchor button. Finally, prove.
                    </div>
                    <div className="bg-info mb-3 p-3 text-black">
                        Select which identity providers to allow
                        {idCred_idpsDisplay}
                    </div>
                    <div>
                        <RevealAttribute setStatement={addIdentityCredentialStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AgeBound younger={true} setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <AgeBound younger={false} setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <AgeInRange setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <DocumentExpiryNoEarlier setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <DocumentIssuerIn setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={true}
                            setStatement={addIdentityCredentialStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={false}
                            setStatement={addIdentityCredentialStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={true}
                            setStatement={addIdentityCredentialStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={false}
                            setStatement={addIdentityCredentialStatement}
                        />
                    </div>
                    <div>
                        <EUAttributeIn nationality={true} setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <EUAttributeIn nationality={false} setStatement={addIdentityCredentialStatement} />
                    </div>
                    <div>
                        <AttributeInRange setStatement={addIdentityCredentialStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AttributeInSet
                            member={true}
                            setStatement={addIdentityCredentialStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                    <div>
                        <AttributeInSet
                            member={false}
                            setStatement={addIdentityCredentialStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                </div>

                <div className="col-sm">
                    <div className="row">
                        <button
                            className="btn btn-primary me-1"
                            onClick={async () => {
                                try {
                                    let provider = await BrowserWalletProvider.getInstance()
                                    await provider.connect();
                                    setProvider(provider);

                                    console.log("Successfully connected to browser wallet.");
                                } catch (err) {
                                    console.error("Failed to connect to browser wallet (make sure it is installed):", err);
                                    toast.error("Failed to connect to browser wallet, make sure it is installed.");
                                } finally {
                                    console.log("Connection attempt to browser wallet finished.");
                                }
                            }
                            }
                        >
                            <div className="fw-bold">Connect Browser Wallet</div>
                        </button>

                        <button
                            className="btn btn-secondary bg-primary mt-2"
                            onClick={async () => {
                                let provider = await WalletConnectProvider.getInstance()
                                await provider.connect([ID_METHOD, SIGN_AND_SEND_TRANSACTION]);
                                setProvider(provider);
                            }}
                        >
                            <div className="fw-bold">Connect Mobile Wallet</div>
                            <div className="small">
                                Methods: {ID_METHOD}, {SIGN_AND_SEND_TRANSACTION}
                            </div>
                        </button>

                        <button
                            className="btn btn-secondary bg-primary mt-2"
                            onClick={async () => {
                                let provider = await WalletConnectProvider.getInstance()
                                await provider.connect([ID_METHOD, ID_METHOD_V1, SIGN_AND_SEND_TRANSACTION]);
                                setProvider(provider);
                            }}
                        >
                            <div className="fw-bold">Connect Mobile Wallet</div>
                            <div className="small">
                                Methods: {ID_METHOD}, {ID_METHOD_V1}, {SIGN_AND_SEND_TRANSACTION}
                            </div>
                        </button>
                    </div>
                    <div>
                        {provider !== undefined && <div className="bg-info p-2 text-center mt-3">
                            Connected to {provider.connectedAccount}</div>}
                        {provider === undefined && (
                            <div className="bg-danger p-2 text-center mt-3"> Not connected </div>
                        )}
                    </div>
                    <hr />
                    <div className="row">
                        <div className="col-sm">
                            {' '}
                            <button
                                title="Start creating a new statement about a potentially different credential."
                                onClick={handleAddTopLevel}
                                type="button"
                                className="btn btn-primary me-1 mt-1"
                            >
                                {'Start a new credential statement'}
                            </button>{' '}
                        </div>

                        <div className="col-sm">
                            {' '}
                            <button
                                title="Delete the last credential statement."
                                onClick={() => {
                                    setCurrentStatementType(undefined);
                                    setStatement((oldStatement) => {
                                        if (oldStatement.length == 0) {
                                            return oldStatement;
                                        } else {
                                            return oldStatement.slice(0, oldStatement.length - 1);
                                        }
                                    })
                                }
                                }
                                type="button"
                                className="btn btn-primary mt-1"
                            >
                                {'Clear last credential statement'}
                            </button>{' '}
                        </div>
                    </div>
                    <hr />

                    <button
                        title="Clear the list of responses from the wallet and the verifier."
                        onClick={() => {
                            setMessages([]);
                            setMessagesV1([]);
                        }}
                        type="button"
                        className="btn btn-primary mt-1"
                    >
                        {'Clear messages'}
                    </button>

                    <hr />

                    <pre>VerifiablePresentionV1 flow for identity credentials</pre>

                    <div className="col-sm">
                        {' '}
                        <button
                            title="Simulate Create Anchor"
                            onClick={runSimulation}
                            type="button"
                            className="btn btn-primary mt-1"
                        >
                            {'Submit Anchor Transaction'}
                        </button>
                        {' '}
                        {simulationResult && (
                            <div className="alert alert-info mt-2">
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {simulationResult}
                                </pre>
                            </div>
                        )}
                    </div>

                    <div className="mt-3">
                        {submitProofDisplayV1}
                    </div>
                    <hr />
                    <pre>VerifiablePresention flow for account/web3id credentials</pre>

                    {submitProofDisplay}

                    <hr />
                    <Statement inner={statement} new_statement={new_statement} />
                </div>
                <br />
                <br />
            </div>
        </main>
    );
}
