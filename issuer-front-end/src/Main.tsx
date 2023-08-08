/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import Switch from 'react-switch';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo, getCredentialEntry } from './reading_from_blockchain';
import { issueCredential, createNewIssuer } from './writing_to_blockchain';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
    note: string;
}>;

function TestBox({ header, children, note }: TestBoxProps) {
    return (
        <fieldset className="testBox">
            <legend>{header}</legend>
            <div className="testBoxFields">{children}</div>
            <br />
            <p className="note">{note}</p>
        </fieldset>
    );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function addRevokationKey(
    revocationKeys: string[],
    setRevocationKeys: (value: string[]) => void,
    setRevoationKeyInput: (value: string) => void,
    newRevocationKey: string
) {
    if (revocationKeys.includes(newRevocationKey)) {
        throw new Error(`Duplicate revocation key: ${newRevocationKey}`);
    }
    if (newRevocationKey.length !== 64) {
        throw new Error(`Revocation key should have a length of 64`);
    }
    if (newRevocationKey) {
        setRevocationKeys([...revocationKeys, newRevocationKey]);
        setRevoationKeyInput('');
    }
}

export default function Main(props: WalletConnectionProps) {
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } = props;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [viewError, setViewError] = useState('');
    const [transactionError, setTransactionError] = useState('');
    const [userInputError2, setUserInputError2] = useState('');

    const [auxiliaryData, setAuxiliaryData] = useState<number[]>([]);

    const [credentialRegistryContratIndex, setCredentialRegistryContratIndex] = useState(0);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const [browserPublicKey, setBrowserPublicKey] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState('https://issuer/metaData/');
    const [issuerKey, setIssuerKey] = useState('8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82');

    const [credentialMetaDataURL, setCredentialMetaDataURL] = useState(
        'https://raw.githubusercontent.com/Concordium/concordium-web3id/credential-metadata-example/examples/json-schemas/metadata/credential-metadata.json'
    );
    const [credentialType, setCredentialType] = useState('JsonSchema2023');
    const [schemaCredential, setSchemaCredential] = useState<object>({
        schema_ref: {
            hash: {
                None: [],
            },
            url: `https://raw.githubusercontent.com/Concordium/concordium-web3id/main/examples/json-schemas/education-certificate/JsonSchema2023-education-certificate.json`,
        },
    });

    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const [isHolderRevocable, setIsHolderRevocable] = useState(true);
    const [validFromDate, setValidFromDate] = useState('2022-06-12T07:30');
    const [validUntilDate, setValidUntilDate] = useState('2025-06-12T07:30');

    const handleValidFromDateChange = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidFromDate(target.value);
    };

    const handleValidUntilDateChange = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidUntilDate(target.value);
    };

    const changePublicKeyHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setPublicKey(target.value);
    };

    const changeIssuerMetaDataURLHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
    };

    const changeIssuerKeyHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerKey(target.value);
    };

    const changeAuxiliaryDataHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setAuxiliaryData(Array.from(JSON.parse(target.value)));
    };

    const changeCredentialSchemaURLHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setSchemaCredential({
            schema_ref: {
                hash: {
                    None: [],
                },
                url: target.value,
            },
        });
    };

    const changeCredentialMetaDataURLHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialMetaDataURL(target.value);
    };

    const changeCredentialTypeHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialType(target.value);
    };

    const changeCredentialRegistryContratIndexHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialRegistryContratIndex(Number(target.value));
    };

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                console.log('refreshing');
                withJsonRpcClient(connection, (rpcClient) => accountInfo(rpcClient, account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                            setBrowserPublicKey(
                                value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                            );
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setBrowserPublicKey('');
                        setViewError((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    useEffect(() => {
        if (connection && account) {
            withJsonRpcClient(connection, (rpcClient) => accountInfo(rpcClient, account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                        setBrowserPublicKey(
                            value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                        );
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setAccountBalance('');
                    setBrowserPublicKey('');
                });
        }
    }, [connection, account]);

    return (
        <main className="container">
            <div className="textCenter">
                Version: {version}
                <h1>Web3ID Issuer Front End</h1>
                <WalletConnectionTypeButton
                    connectorType={BROWSER_WALLET}
                    connectorName="Browser Wallet"
                    setWaitingForUser={setWaitingForUser}
                    connection={connection}
                    {...props}
                />
                {activeConnectorError && (
                    <p className="alert alert-danger" role="alert">
                        Connector Error: {activeConnectorError}.
                    </p>
                )}
                {!activeConnectorError && !isWaitingForTransaction && activeConnectorType && !activeConnector && (
                    <p>
                        <i>Loading connector...</i>
                    </p>
                )}
                {connectError && (
                    <p className="alert alert-danger" role="alert">
                        Connect Error: {connectError}.
                    </p>
                )}
                {!connection && !isWaitingForTransaction && activeConnectorType && activeConnector && (
                    <p>
                        <button className="btn btn-primary me-1" type="button" onClick={connect}>
                            {isConnecting && 'Connecting...'}
                            {!isConnecting && activeConnectorType === BROWSER_WALLET && 'Connect Browser Wallet'}
                        </button>
                    </p>
                )}
            </div>

            {account && (
                <div className="row">
                    {connection && account !== undefined && (
                        <div className="col-lg-6">
                            <TestBox
                                header="Step 1: Create New Issuer"
                                note="
                                        Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column.
                                        "
                            >
                                Add `IssuerMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="issuerMetaDataURL"
                                    type="text"
                                    placeholder="https://issuer/metaData/"
                                    onChange={changeIssuerMetaDataURLHandler}
                                />
                                <br />
                                Add `IssuerKey`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="issuerKey"
                                    type="text"
                                    placeholder="8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82"
                                    onChange={changeIssuerKeyHandler}
                                />
                                <br />
                                Add `CredentialType`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialType"
                                    type="text"
                                    placeholder="JsonSchema2023"
                                    onChange={changeCredentialTypeHandler}
                                />
                                <br />
                                Add `Schema`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialSchemaURL"
                                    type="text"
                                    placeholder="https://raw.githubusercontent.com/Concordium/concordium-web3id/main/examples/json-schemas/education-certificate/JsonSchema2023-education-certificate.json"
                                    onChange={changeCredentialSchemaURLHandler}
                                />
                                {revocationKeys.length !== 0 && (
                                    <div className="actionResultBox">
                                        <div>You have added the following `revocationKeys`:</div>
                                        <div>
                                            {revocationKeys?.map((element) => (
                                                <li key={element}>{element}</li>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {userInputError2 !== '' && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {userInputError2}.
                                    </div>
                                )}
                                <br />
                                <Form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        setUserInputError2('');
                                        addRevokationKey(
                                            revocationKeys,
                                            setRevocationKeys,
                                            setRevocationKeyInput,
                                            revocationKeyInput
                                        ).catch((err: Error) => setUserInputError2((err as Error).message));
                                    }}
                                >
                                    <div>Add `RevocationKeys`:</div>
                                    <br />
                                    <Row>
                                        <Col sm={10}>
                                            <InputGroup className="mb-3">
                                                <Form.Control
                                                    placeholder="RevocationKey"
                                                    value={revocationKeyInput}
                                                    onChange={(e) => setRevocationKeyInput(e.target.value)}
                                                />
                                                <Button type="submit" variant="outline-secondary">
                                                    Add
                                                </Button>
                                            </InputGroup>
                                        </Col>
                                        <Col sm={1}>
                                            <Button
                                                variant="outline-secondary"
                                                onClick={() => {
                                                    setRevocationKeys([]);
                                                    setRevocationKeyInput('');
                                                    setUserInputError2('');
                                                }}
                                            >
                                                Clear
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = createNewIssuer(
                                            connection,
                                            account,
                                            issuerMetaData,
                                            issuerKey,
                                            JSON.stringify(schemaCredential),
                                            JSON.stringify(revocationKeys),
                                            credentialType
                                        );
                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Create New Issuer
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 2: Input Smart Contract Index"
                                note="
                                Expected result after inputing a value: The inex or
                                an error message should appear in the above test unit.
                                        "
                            >
                                <label className="field">
                                    Input smart contract index created in above step:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="credentialRegistryContratIndex"
                                        type="text"
                                        placeholder="1111"
                                        onChange={changeCredentialRegistryContratIndexHandler}
                                    />
                                </label>
                                {credentialRegistryContratIndex !== 0 && (
                                    <div className="actionResultBox">
                                        <div> You will be using this registry contract index: </div>
                                        <br />
                                        <div>{credentialRegistryContratIndex}</div>
                                    </div>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 3: Register a credential for the account connected"
                                note="Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column."
                            >
                                Add `valid_from`:
                                <br />
                                <br />
                                <input
                                    type="datetime-local"
                                    id="valid_from"
                                    name="valid_from"
                                    value={validFromDate}
                                    onChange={handleValidFromDateChange}
                                />
                                <br />
                                <br />
                                Add `valid_until`:
                                <br />
                                <br />
                                <input
                                    type="datetime-local"
                                    id="valid_until"
                                    name="valid_until"
                                    value={validUntilDate}
                                    onChange={handleValidUntilDateChange}
                                />
                                <br />
                                <br />
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder="https://raw.githubusercontent.com/Concordium/concordium-web3id/credential-metadata-example/examples/json-schemas/metadata/credential-metadata.json"
                                    onChange={changeCredentialMetaDataURLHandler}
                                />
                                <br />
                                Add `AuxiliaryData`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="auxiliaryData"
                                    type="text"
                                    placeholder="[23,2,1,5,3,2]"
                                    onChange={changeAuxiliaryDataHandler}
                                />
                                <div className="switch-wrapper">
                                    <div>Holder can revoke credential</div>
                                    <Switch
                                        onChange={() => {
                                            setIsHolderRevocable(!isHolderRevocable);
                                        }}
                                        onColor="#308274"
                                        offColor="#308274"
                                        onHandleColor="#174039"
                                        offHandleColor="#174039"
                                        checked={!isHolderRevocable}
                                        checkedIcon={false}
                                        uncheckedIcon={false}
                                    />
                                    <div>Holder can NOT revoke credential</div>
                                </div>
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        setTxHash('');
                                        setTransactionError('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Input Smart Contract Index in Step 2`);
                                            throw new Error(`Input Smart Contract Index in Step 2`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const values = {
                                            degreeType: 'BachelorDegree',
                                            degreeName: 'Bachelor of Science and Arts',
                                            graduationDate: '2023-08-07T00:00:00.000Z',
                                        };
                                        const metadataUrl = {
                                            url: 'https://raw.githubusercontent.com/Concordium/concordium-web3id/credential-metadata-example/examples/json-schemas/metadata/credential-metadata.json',
                                        };

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: './JsonSchema2023-education-certificate.json',
                                                    type: [
                                                        'VerifiableCredential',
                                                        'ConcordiumVerifiableCredential',
                                                        'UniversityDegreeCredential',
                                                    ],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: values,
                                                    credentialSchema: {
                                                        id: 'https://raw.githubusercontent.com/Concordium/concordium-web3id/main/examples/json-schemas/education-certificate/JsonSchema2023-education-certificate.json',
                                                        type: 'JsonSchema2023',
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    console.log('publicKey: ');
                                                    console.log(id);

                                                    const tx = issueCredential(
                                                        connection,
                                                        account,
                                                        id,
                                                        validFromDate,
                                                        validUntilDate,
                                                        credentialMetaDataURL,
                                                        isHolderRevocable,
                                                        credentialRegistryContratIndex,
                                                        auxiliaryData
                                                    );

                                                    const txHashReturned = await tx;
                                                    console.log("txHash:");
                                                    console.log(txHashReturned);

                                                    console.log('Waiting for 30000ms...');
                                                    await sleep(30000);
                                                    console.log('30000ms have passed.');

                                                    setTxHash(txHashReturned); // TODO: handle error

                                                    // Dummy signature/randomness since no checking has been implemented in the wallets yet.
                                                    // The plan is that the corresponding private key to the `issuer_key(public_key)` registered in the smart contract needs to create this signature.
                                                    const signature =
                                                        'E051028C0011B76A2BA6B17A51B4A1FF0BDC9404E7033FCFACB6AFC4F615A15C74DE53AAF2E8C4316BCD4A5D971B49A85FB1B24111A8A52DB24A45B343880C01';
                                                    const randomness: Record<string, string> = {};
                                                    return { signature, randomness };
                                                }
                                            )
                                            .catch((e) => {
                                                console.log(e);
                                            });
                                    }}
                                >
                                    Register Credential
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 4: View Credential Entry in Registry Contract"
                                note="Expected result after pressing the button: The return value or an error message
                                        should appear in the above test unit."
                            >
                                <br />
                                <label className="field">
                                    Public Key:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="publicKey"
                                        type="text"
                                        placeholder="37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499"
                                        onChange={changePublicKeyHandler}
                                    />
                                </label>
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setCredentialRegistryState('');
                                        setCredentialRegistryStateError('');
                                        withJsonRpcClient(connection, (rpcClient) =>
                                            getCredentialEntry(rpcClient, publicKey, credentialRegistryContratIndex)
                                        )
                                            .then((value) => {
                                                if (value !== undefined) {
                                                    setCredentialRegistryState(JSON.parse(value));
                                                }
                                            })
                                            .catch((e) => {
                                                setCredentialRegistryStateError((e as Error).message);
                                            });
                                    }}
                                >
                                    View Credential Entry in Registry Contract
                                </button>
                                {credentialRegistryState !== '' && (
                                    <div className="actionResultBox">
                                        <div>Your return value is:</div>
                                        <br />
                                        <pre className="largeText">
                                            {JSON.stringify(credentialRegistryState, null, '\t')}
                                        </pre>
                                    </div>
                                )}
                                {!credentialRegistryState && credentialRegistryStateError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {credentialRegistryStateError}.
                                    </div>
                                )}
                            </TestBox>
                        </div>
                    )}
                    <div className="col-lg-6">
                        <div className="sticky-top">
                            <br />
                            <h5>
                                This column refreshes every few seconds to update your account balanace. It also
                                displays your connected account, your public key, transaction hashes, and error
                                messages.
                            </h5>
                            <div className="label">Connected account:</div>
                            <div>
                                <a
                                    className="link"
                                    href={`https://testnet.ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {account}
                                </a>
                            </div>
                            <br />
                            <div className="label">Your public key:</div>
                            <div>{browserPublicKey}</div>
                            <br />
                            <div className="label">Your account balance:</div>
                            <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                            <br />
                            <div className="label">
                                Error or Transaction status
                                {txHash === '' ? ':' : ' (May take a moment to finalize):'}
                            </div>
                            <br />
                            {!txHash && !transactionError && (
                                <div className="actionResultBox" role="alert">
                                    IMPORTANT: After pressing a button on the left side that should send a transaction,
                                    the transaction hash or error returned by the wallet are displayed HERE.
                                </div>
                            )}
                            {!txHash && transactionError && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {transactionError}.
                                </div>
                            )}
                            {viewError && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewError}.
                                </div>
                            )}
                            {txHash && (
                                <a
                                    className="link"
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://testnet.ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHash}`}
                                >
                                    {txHash}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
