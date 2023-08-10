/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useRef } from 'react';
import Switch from 'react-switch';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { Web3StatementBuilder } from '@concordium/web-sdk';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo, getCredentialEntry } from './reading_from_blockchain';
import { issueCredential, createNewIssuer } from './writing_to_blockchain';
import { requestSignature, requestIssuerKeys } from './api_calls_to_backend';

import {
    EXAMPLE_CREDENTIAL_SCHEMA,
    EXAMPLE_CREDENTIAL_METADATA,
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    EXAMPLE_ATTRIBUTES,
    EXAMPLE_COMMITMENTS_ATTRIBUTES,
} from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
    note: string;
}>;

type RequestSignatureResponse = {
    signedCommitments: {
        signature: string;
        commitments: object;
    };
    randomness: object;
};

type RequestIssuerKeysResponse = {
    signKey: string;
    verifyKey: string;
};

type SchemaRef = {
    schema_ref: {
        hash: {
            None: [];
        };
        url: string;
    };
};

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

    const [proofError, setProofError] = useState('');
    const [proof, setProof] = useState<object>({});

    const [seed, setSeed] = useState('myRandomSeedString');
    const [issuerKeys, setIssuerKeys] = useState<RequestIssuerKeysResponse>();
    const [parsingError, setParsingError] = useState('');
    const [attributes, setAttributes] = useState<object>({});
    const [commitmentesAttributes, setCommitmentsAttributes] = useState<object>({});

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const [credentialPublicKey, setCredentialPublicKey] = useState('');

    const [browserPublicKey, setBrowserPublicKey] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState('https://issuer/metaData/');

    const [credentialMetaDataURL, setCredentialMetaDataURL] = useState(EXAMPLE_CREDENTIAL_METADATA);
    const [credentialType, setCredentialType] = useState('JsonSchema2023');
    const [schemaCredential, setSchemaCredential] = useState<SchemaRef>({
        schema_ref: {
            hash: {
                None: [],
            },
            url: EXAMPLE_CREDENTIAL_SCHEMA,
        },
    });

    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const [isHolderRevocable, setIsHolderRevocable] = useState(true);
    const [validFromDate, setValidFromDate] = useState('2022-06-12T07:30');
    const [validUntilDate, setValidUntilDate] = useState('2025-06-12T07:30');

    const attributesTextAreaRef = useRef(null);
    const commitmentsAttributesTextAreaRef = useRef(null);

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

    const changeAuxiliaryDataHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setAuxiliaryData(Array.from(JSON.parse(target.value)));
    };

    const changeSeedHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setSeed(target.value);
    };

    const changeAttributesTextAreaHandler = (event: ChangeEvent) => {
        setParsingError('');
        setAttributes({});
        const inputTextArea = attributesTextAreaRef.current as unknown as HTMLTextAreaElement;
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);
        const target = event.target as HTMLTextAreaElement;

        try {
            JSON.parse(target.value);
        } catch (e) {
            setParsingError((e as Error).message);
            return;
        }

        setAttributes(JSON.parse(target.value));
    };

    const changeCommitmentsTextAreaHandler = (event: ChangeEvent) => {
        setParsingError('');
        setCommitmentsAttributes({});
        const inputTextArea = commitmentsAttributesTextAreaRef.current as unknown as HTMLTextAreaElement;
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);
        const target = event.target as HTMLTextAreaElement;

        try {
            JSON.parse(target.value);
        } catch (e) {
            setParsingError((e as Error).message);
            return;
        }

        setCommitmentsAttributes(JSON.parse(target.value));
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

        setAttributes(EXAMPLE_ATTRIBUTES);
        setCommitmentsAttributes(EXAMPLE_COMMITMENTS_ATTRIBUTES);
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
                                header="Step 1: Create Issuer Keys"
                                note="Expected result after pressing the button: The return value or an error message
                                      should appear in the above test unit."
                            >
                                Add `Seed`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="seed"
                                    type="text"
                                    placeholder="myRandomSeedString"
                                    onChange={changeSeedHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        const requestIssuerKeysResponse = (await requestIssuerKeys(
                                            seed
                                        )) as RequestIssuerKeysResponse;
                                        setIssuerKeys(requestIssuerKeysResponse);
                                    }}
                                >
                                    Create Issuer Keys
                                </button>
                                {issuerKeys && (
                                    <>
                                        <br />
                                        <br />
                                        <div className="actionResultBox">
                                            Issuer Keys:
                                            <div>{JSON.stringify(issuerKeys, null, '\t')}</div>
                                        </div>
                                    </>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 2: Create New Issuer"
                                note="
                                        Expected result after pressing the button and confirming in the wallet: The
                                        transaction hash or an error message should appear in the right column.
                                        Pressing the button without any user input will create an example tx with the provided placeholder values.
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
                                    placeholder="https://raw.githubusercontent.com/Concordium/concordium-web3id/287ca9c47dc43037a21d1544e9ccf87d0c6108c6/examples/json-schemas/education-certificate/JsonSchema2023-education-certificate.json"
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
                                            issuerKeys?.verifyKey || '',
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
                                header="Step 3: Input Smart Contract Index"
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
                                header="Step 4: Register a credential"
                                note="Expected result after pressing the button: There should be two popups happening in the wallet
                                    (first action to add the credential, second action to send the `issueCredential` tx to the smart contract).
                                    The transaction hash or an error message should appear in the right column and the 
                                    credential public key or an error message should appear in the above test unit. 
                                    Pressing the button without any user input will create an example tx with the provided placeholder values."
                            >
                                Add `credentialAttributes`:
                                <textarea
                                    id="attributesTextArea"
                                    ref={attributesTextAreaRef}
                                    onChange={changeAttributesTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
                                Add `commitmentsAttributes`:
                                <textarea
                                    id="commitmentsAttributesTextArea"
                                    ref={commitmentsAttributesTextAreaRef}
                                    onChange={changeCommitmentsTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_COMMITMENTS_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
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
                                        setCredentialPublicKey('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const values = attributes;

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: './JsonSchema2023-education-certificate.json',
                                                    type: ['VerifiableCredential', 'ConcordiumVerifiableCredential'],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: values,
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    setCredentialPublicKey(id);

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

                                                    tx.then(setTxHash).catch((err: Error) =>
                                                        setTransactionError((err as Error).message)
                                                    );

                                                    const commitments = {
                                                        attributes: commitmentesAttributes,
                                                        holderId: id,
                                                        issuer: {
                                                            index: credentialRegistryContratIndex,
                                                            subindex: 0,
                                                        },
                                                    };

                                                    const requestSignatureResponse = (await requestSignature(
                                                        seed,
                                                        JSON.stringify(commitments)
                                                    )) as RequestSignatureResponse;

                                                    return {
                                                        signature: requestSignatureResponse.signedCommitments.signature,
                                                        randomness: requestSignatureResponse.randomness,
                                                    };
                                                }
                                            )
                                            .catch((e: Error) => {
                                                console.error(e);
                                            });
                                    }}
                                >
                                    Register Credential
                                </button>
                                {credentialPublicKey && (
                                    <>
                                        <br />
                                        <br />
                                        <div className="actionResultBox">
                                            Credential Public Key:
                                            <div>{credentialPublicKey}</div>
                                        </div>
                                    </>
                                )}
                                {parsingError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {parsingError}.
                                    </div>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 5: View Credential Entry in Registry Contract"
                                note="Expected result after pressing the button: The return value or an error message
                                        should appear in the above test unit."
                            >
                                <br />
                                <label className="field">
                                    Credential Public Key:
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
                                <br />
                                <br />
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
                            <TestBox
                                header="Step 6: Create Proof"
                                note="Expected result after pressing the button: The return value or an error message
                                        should appear in the above test unit. To create a valid proof only works for the default `Bachelor of Science and Arts` example."
                            >
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        setProof({});
                                        setProofError('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const statement = new Web3StatementBuilder()
                                            .addForVerifiableCredentials(
                                                [{ index: credentialRegistryContratIndex, subindex: 0 }],
                                                (b) =>
                                                    b
                                                        .revealAttribute(0)
                                                        .addMembership(1, [
                                                            'Bachelor of Science and Arts',
                                                            'Bachelor of New',
                                                        ])
                                            )
                                            .getStatements();

                                        // Should be not be hardcoded
                                        const challenge =
                                            '94d3e85bbc8ff0091e562ad8ef6c30d57f29b19f17c98ce155df2a30100dAAAA';

                                        provider
                                            .requestVerifiablePresentation(challenge, statement)
                                            .then((proofReturned) => {
                                                setProof(proofReturned);
                                            })
                                            .catch((error: Error) => {
                                                setProofError(error.message);
                                            });
                                    }}
                                >
                                    Create Proof
                                </button>
                                <br />
                                <br />
                                {Object.keys(proof).length !== 0 && (
                                    <div className="actionResultBox">
                                        <div>Your proof is:</div>
                                        <br />
                                        <pre className="largeText">{JSON.stringify(proof, null, '\t')}</pre>
                                    </div>
                                )}
                                {proofError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {proofError}.
                                    </div>
                                )}
                            </TestBox>
                            <br />
                            <br />
                            <div className="textCenter">Negative Test Scenarios</div>
                            <br />
                            <br />
                            <TestBox
                                header="Step 7: Register a credential (Issuer registers credential with some delay)"
                                note="Expected result after pressing the two buttons: There should be two popups happening in the wallet
                                    (first action when pressing the first button to add the credential, second action when pressing the second button to send the `issueCredential` tx to the smart contract).
                                    The transaction hash or an error message should appear in the right column and the 
                                    credential public key or an error message should appear in the above test unit. 
                                    Pressing the button without any user input will create an example tx with the provided placeholder values."
                            >
                                Add `credentialAttributes`:
                                <textarea
                                    id="attributesTextArea"
                                    ref={attributesTextAreaRef}
                                    onChange={changeAttributesTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
                                Add `commitmentsAttributes`:
                                <textarea
                                    id="commitmentsAttributesTextArea"
                                    ref={commitmentsAttributesTextAreaRef}
                                    onChange={changeCommitmentsTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_COMMITMENTS_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
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
                                        setCredentialPublicKey('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const values = attributes;

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: './JsonSchema2023-education-certificate.json',
                                                    type: ['VerifiableCredential', 'ConcordiumVerifiableCredential'],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: values,
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    setCredentialPublicKey(id);

                                                    const commitments = {
                                                        attributes: commitmentesAttributes,
                                                        holderId: id,
                                                        issuer: {
                                                            index: credentialRegistryContratIndex,
                                                            subindex: 0,
                                                        },
                                                    };

                                                    const requestSignatureResponse = (await requestSignature(
                                                        seed,
                                                        JSON.stringify(commitments)
                                                    )) as RequestSignatureResponse;

                                                    return {
                                                        signature: requestSignatureResponse.signedCommitments.signature,
                                                        randomness: requestSignatureResponse.randomness,
                                                    };
                                                }
                                            )
                                            .catch((e: Error) => {
                                                console.error(e);
                                            });
                                    }}
                                >
                                    Register Credential
                                </button>
                                {parsingError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {parsingError}.
                                    </div>
                                )}
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        setTxHash('');
                                        setTransactionError('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        // Issuer registers credential delayed.

                                        const tx = issueCredential(
                                            connection,
                                            account,
                                            credentialPublicKey,
                                            validFromDate,
                                            validUntilDate,
                                            credentialMetaDataURL,
                                            isHolderRevocable,
                                            credentialRegistryContratIndex,
                                            auxiliaryData
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Issuer Registers Credential Delayed
                                </button>
                                {credentialPublicKey && (
                                    <>
                                        <br />
                                        <br />
                                        <div className="actionResultBox">
                                            Credential Public Key:
                                            <div>{credentialPublicKey}</div>
                                        </div>
                                    </>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 8: Register a credential (Issuer fails to provide correct randomness/signature)"
                                note="Expected result after pressing the button: There should be two popups happening in the wallet
                                (first action to add the credential, second action to send the `issueCredential` tx to the smart contract).
                                The transaction hash or an error message should appear in the right column and the 
                                credential public key or an error message should appear in the above test unit. 
                                Pressing the button without any user input will create an example tx with the provided placeholder values."
                            >
                                Add `credentialAttributes`:
                                <textarea
                                    id="attributesTextArea"
                                    ref={attributesTextAreaRef}
                                    onChange={changeAttributesTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
                                Add `commitmentsAttributes`:
                                <textarea
                                    id="commitmentsAttributesTextArea"
                                    ref={commitmentsAttributesTextAreaRef}
                                    onChange={changeCommitmentsTextAreaHandler}
                                >
                                    {JSON.stringify(EXAMPLE_COMMITMENTS_ATTRIBUTES, undefined, 2)}
                                </textarea>
                                <br />
                                <br />
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
                                        setCredentialPublicKey('');

                                        if (credentialRegistryContratIndex === 0) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const values = attributes;

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: './JsonSchema2023-education-certificate.json',
                                                    type: ['VerifiableCredential', 'ConcordiumVerifiableCredential'],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: values,
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    setCredentialPublicKey(id);

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

                                                    tx.then(setTxHash).catch((err: Error) =>
                                                        setTransactionError((err as Error).message)
                                                    );

                                                    // Issuer fails to create correct randomness/signature
                                                    return {
                                                        signature:
                                                            'e8c3944d6a9a19e74ad3ef028b04c0637756540306aba8842000f557cbfb7415187f907d26f20474081d4084fc8e5ff14167171f65fac76b06508ae46f55aa05',
                                                        randomness: {
                                                            Hello: '2d5bbf82232465715f23396f4ece8ccc40ad178b7262d01aad97c9de5380ae07',
                                                            No: '0cc9acd652b6c29aaff42bcf8da242afee622262b0d3e37f17c57ac8d4ae42d9',
                                                            Three: '1fad03391f7c8d72980e53a44e0782f58822eb74f06ff2c7e9e09e6b08f7ca73',
                                                        },
                                                    };
                                                }
                                            )
                                            .catch((e: Error) => {
                                                console.error(e);
                                            });
                                    }}
                                >
                                    Register Credential
                                </button>
                                {credentialPublicKey && (
                                    <>
                                        <br />
                                        <br />
                                        <div className="actionResultBox">
                                            Credential Public Key:
                                            <div>{credentialPublicKey}</div>
                                        </div>
                                    </>
                                )}
                                {parsingError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {parsingError}.
                                    </div>
                                )}
                            </TestBox>
                        </div>
                    )}
                    <div className="col-lg-6">
                        <div className="sticky-top">
                            <br />
                            <h5>
                                This column refreshes every few seconds to update your account balance. It also
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
