/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useCallback } from 'react';
import Switch from 'react-switch';
import { WalletConnectionProps, useConnection, useConnect, useGrpcClient, TESTNET } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { AccountAddress, ConcordiumGRPCClient } from '@concordium/web-sdk';
import { stringify } from 'json-bigint';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { getCredentialEntry, registryMetadata } from './reading_from_blockchain';
import {
    issueCredential,
    createNewIssuer,
    revokeCredential,
    restoreCredential,
    updateIssuerMetadata,
    updateCredentialSchema,
    updateCredentialMetadata,
} from './writing_to_blockchain';
import { requestSignature, requestIssuerKeys } from './api_calls_to_backend';

import {
    EXAMPLE_CREDENTIAL_SCHEMA,
    EXAMPLE_CREDENTIAL_METADATA,
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    EXAMPLE_ISSUER_METADATA,
    DEFAULT_CREDENTIAL_TYPES,
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
    randomness: Record<string, string>;
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

interface Attribute {
    [key: string]: string | bigint;
}

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

type AttributeDetails = { tag: string; type: string; value: string | undefined };
const WRONG_ATTRIBUTES: AttributeDetails[] = [{ tag: 'myWrongAttribute', type: 'string', value: 'myWrongValue' }];

export default function Main(props: WalletConnectionProps) {
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } = props;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [viewErrorSmartContractState, setViewErrorSmartContractState] = useState('');
    const [viewErrorAccountBalance, setViewErrorAccountBalance] = useState('');
    const [transactionError, setTransactionError] = useState('');
    const [userInputError2, setUserInputError2] = useState('');

    const [auxiliaryData, setAuxiliaryData] = useState<number[]>([]);

    const [credentialRegistryContratIndex, setCredentialRegistryContratIndex] = useState<number | undefined>(undefined);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [seed, setSeed] = useState('myRandomSeedString');
    const [issuerKeys, setIssuerKeys] = useState<RequestIssuerKeysResponse>();
    const [parsingError, setParsingError] = useState('');

    const [attributeSchema, setAttributeSchema] = useState<AttributeDetails[]>([]);

    const [reason, setReason] = useState('');

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const [credentialPublicKey, setCredentialPublicKey] = useState('');

    const [browserPublicKey, setBrowserPublicKey] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState(EXAMPLE_ISSUER_METADATA);
    const [updatedIssuerMetaData, setUpdatedIssuerMetaData] = useState('');
    const [updatedCredentialSchema, setUpdatedCredentialSchema] = useState('');

    const [smartContractState, setSmartContractState] = useState('');
    const [fetchingCredentialSchemaError, setFetchingCredentialSchemaError] = useState('');

    const [credentialMetaDataURL, setCredentialMetaDataURL] = useState(EXAMPLE_CREDENTIAL_METADATA);
    const [updatedCredentialMetaDataURL, setUpdatedCredentialMetaDataURL] = useState('');
    const [credentialType, setCredentialType] = useState('myCredentialType');
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
    const [credentialHasExpiryDate, setCredentialHasExpiryDate] = useState(true);

    const handleValidFromDateChange = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidFromDate(target.value);
    }, []);

    const handleValidUntilDateChange = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidUntilDate(target.value);
    }, []);

    const changePublicKeyHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setPublicKey(target.value);
    }, []);

    const changeIssuerMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
    }, []);

    const changeUpdatedIssuerMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setUpdatedIssuerMetaData(target.value);
    }, []);

    const changeUpdatedCredentialSchemaURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setUpdatedCredentialSchema(target.value);
    }, []);

    const changeUpdatedCredentialMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setUpdatedCredentialMetaDataURL(target.value);
    }, []);

    const changeAuxiliaryDataHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setAuxiliaryData(Array.from(JSON.parse(target.value)));
    }, []);

    const changeSeedHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setSeed(target.value);
    }, []);

    const grpcClient = useGrpcClient(TESTNET);

    const changeCredentialSchemaURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setSchemaCredential({
            schema_ref: {
                hash: {
                    None: [],
                },
                url: target.value,
            },
        });
    }, []);

    const changeCredentialMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialMetaDataURL(target.value);
    }, []);

    const changeReasonHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setReason(target.value);
    }, []);

    const changeCredentialTypeHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialType(target.value);
    }, []);

    const changeCredentialRegistryContratIndexHandler = useCallback(
        async (client: ConcordiumGRPCClient | undefined, event: ChangeEvent) => {
            const target = event.target as HTMLTextAreaElement;
            setCredentialRegistryContratIndex(Number(target.value));

            registryMetadata(client, Number(target.value))
                .then((value) => {
                    setViewErrorSmartContractState('');

                    const registryMetadataReturnValue = JSON.parse(value);
                    setSmartContractState(registryMetadataReturnValue);

                    const schemaURL = registryMetadataReturnValue.credential_schema.schema_ref.url;

                    fetch(schemaURL)
                        .then((response) => {
                            if (response.status !== 200) {
                                throw new Error(`Status: ${response.status}; StatusText: ${response.statusText}`);
                            }
                            return response.json();
                        })
                        .then((json) => {
                            const { properties } = json.properties.credentialSubject.properties.attributes;

                            const attributeSchemaValues: AttributeDetails[] = [];
                            Object.entries(properties).forEach(([key, obj]) => {
                                attributeSchemaValues.push({
                                    tag: key,
                                    type: (obj as { type: string }).type,
                                    value: undefined,
                                });
                            });
                            setFetchingCredentialSchemaError('');
                            setAttributeSchema(attributeSchemaValues);
                        })
                        .catch((e) => {
                            setAttributeSchema([]);
                            setFetchingCredentialSchemaError(
                                `Could not fetch credential schema from smart contract: ${(e as Error).message}`
                            );
                        });
                })
                .catch((e) => {
                    setAttributeSchema([]);
                    setSmartContractState('');
                    setViewErrorSmartContractState((e as Error).message);
                });
        },
        []
    );

    const handleAttributeChange = useCallback(
        (i: string, attributeSchemaValue: AttributeDetails[], event: ChangeEvent) => {
            const target = event.target as HTMLTextAreaElement;

            attributeSchemaValue.forEach((obj) => {
                if (obj.tag === i) {
                    // eslint-disable-next-line no-param-reassign
                    obj.value = target.value;
                }
            });
        },
        []
    );

    // Refresh smartContractState periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && credentialRegistryContratIndex) {
            const interval = setInterval(async () => {
                if (credentialRegistryContratIndex !== undefined) {
                    registryMetadata(grpcClient, credentialRegistryContratIndex)
                        .then((value) => {
                            setSmartContractState(JSON.parse(value));
                            setViewErrorSmartContractState('');
                        })
                        .catch((e) => {
                            setAttributeSchema([]);
                            setSmartContractState('');
                            setViewErrorSmartContractState((e as Error).message);
                        });
                }
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, credentialRegistryContratIndex]);

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                grpcClient
                    ?.getAccountInfo(new AccountAddress(account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                            setBrowserPublicKey(
                                value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                            );
                        }
                        setViewErrorAccountBalance('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setBrowserPublicKey('');
                        setViewErrorAccountBalance((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    useEffect(() => {
        if (connection && account) {
            grpcClient
                ?.getAccountInfo(new AccountAddress(account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                        setBrowserPublicKey(
                            value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                        );
                    }
                    setViewErrorAccountBalance('');
                })
                .catch((e) => {
                    setViewErrorAccountBalance((e as Error).message);
                    setAccountBalance('');
                    setBrowserPublicKey('');
                });
        }
    }, [connection, account]);

    useEffect(() => {
        fetch(EXAMPLE_CREDENTIAL_SCHEMA)
            .then((response) => response.json())
            .then((json) => {
                const { properties } = json.properties.credentialSubject.properties.attributes;

                const attributeSchemaValues: AttributeDetails[] = [];
                Object.entries(properties).forEach(([key, obj]) => {
                    attributeSchemaValues.push({ tag: key, type: (obj as { type: string }).type, value: undefined });
                });

                setAttributeSchema(attributeSchemaValues);
            })
            .catch((e) => console.error(e));
    }, []);

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
                                    placeholder={EXAMPLE_ISSUER_METADATA}
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
                                    placeholder="myCredentialType"
                                    onChange={changeCredentialTypeHandler}
                                />
                                <br />
                                Add `CredentialSchema`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialSchemaURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_SCHEMA}
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

                                        const schemaCredentialURL = document.getElementById(
                                            'credentialSchemaURL'
                                        ) as unknown as HTMLFormElement;

                                        const exampleCredentialSchema = {
                                            schema_ref: {
                                                hash: {
                                                    None: [],
                                                },
                                                url: EXAMPLE_CREDENTIAL_SCHEMA,
                                            },
                                        };

                                        const tx = createNewIssuer(
                                            connection,
                                            account,
                                            issuerMetaData,
                                            issuerKeys?.verifyKey || '',
                                            schemaCredentialURL.value === ''
                                                ? exampleCredentialSchema
                                                : schemaCredential,
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
                                Expected result after inputting a value: The index should appear in the above test unit. In addition,
                                an error message can appear either in the above test unit or on the right side if the credentialSchema
                                cannot be fetched correctly from the given smart contract."
                            >
                                Input smart contract index created in the above step:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialRegistryContratIndex"
                                    type="text"
                                    placeholder="1111"
                                    onChange={(event) => {
                                        changeCredentialRegistryContratIndexHandler(grpcClient, event);
                                    }}
                                />
                                {credentialRegistryContratIndex !== undefined && (
                                    <div className="actionResultBox">
                                        <div> You will be using this registry contract index: </div>
                                        <br />
                                        <div>{credentialRegistryContratIndex}</div>
                                    </div>
                                )}
                                {fetchingCredentialSchemaError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {fetchingCredentialSchemaError}.
                                    </div>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 4: Register a credential"
                                note="Expected result after pressing the button: There should be two popups happening in the wallet
                                    (first action to add the credential, second action to send the `issueCredential` tx to the smart contract).
                                    The transaction hash or an error message should appear in the right column and the 
                                    credential public key or an error message should appear in the above test unit. 
                                    Pressing the button without any user input will create an example tx with the provided placeholder values.
                                    Your credential will be shown in the `Verifiable Credential` 
                                    section in the browser wallet after the `issueCredential` tx is finalized."
                            >
                                {attributeSchema.map((item) => (
                                    <div>
                                        Add {item.tag}:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id={item.tag}
                                            name={item.tag}
                                            type="text"
                                            placeholder={item.type === 'string' ? 'myString' : '1234'}
                                            onChange={(event) => {
                                                handleAttributeChange(item.tag, attributeSchema, event);
                                            }}
                                        />
                                        <br />
                                        <br />
                                    </div>
                                ))}
                                <br />
                                <br />
                                <div style={{ fontWeight: credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has expiry date
                                </div>
                                <Switch
                                    onChange={() => {
                                        setCredentialHasExpiryDate(!credentialHasExpiryDate);
                                    }}
                                    onColor="#308274"
                                    offColor="#308274"
                                    onHandleColor="#174039"
                                    offHandleColor="#174039"
                                    checked={!credentialHasExpiryDate}
                                    checkedIcon={false}
                                    uncheckedIcon={false}
                                />
                                <div style={{ fontWeight: !credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has NO expiry date
                                </div>
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
                                {credentialHasExpiryDate && (
                                    <>
                                        Add`valid_until`:
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
                                    </>
                                )}
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_METADATA}
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
                                    <div style={{ fontWeight: isHolderRevocable ? 'bold' : 'normal' }}>
                                        Holder can revoke credential
                                    </div>
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
                                    <div style={{ fontWeight: !isHolderRevocable ? 'bold' : 'normal' }}>
                                        Holder can NOT revoke credential
                                    </div>
                                </div>
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        setTxHash('');
                                        setTransactionError('');
                                        setCredentialPublicKey('');
                                        setParsingError('');

                                        if (credentialRegistryContratIndex === undefined) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        const attributes: Attribute = {};

                                        attributeSchema.forEach((obj) => {
                                            // if (obj.value === undefined) {
                                            //     setParsingError(`Attribute ${obj.tag} needs to be set.`);
                                            //     throw new Error(`Attribute ${obj.tag} needs to be set.`);
                                            // }

                                            if (obj.value !== undefined) {
                                                if (obj.type === 'string') {
                                                    attributes[obj.tag] = obj.value;
                                                } else if (obj.type === 'number') {
                                                    attributes[obj.tag] = BigInt(obj.value);
                                                } else {
                                                    setParsingError(
                                                        `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                    );
                                                    throw new Error(
                                                        `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                    );
                                                }
                                            }
                                        });

                                        const types = Array.from(DEFAULT_CREDENTIAL_TYPES);

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: 'https://json-schema.org/draft/2020-12/schema',
                                                    type: [...types, credentialType],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: { attributes },
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    const publicKeyOfCredential = id.replace(
                                                        'did:ccd:testnet:pkc:',
                                                        ''
                                                    );

                                                    setCredentialPublicKey(publicKeyOfCredential);

                                                    const tx = issueCredential(
                                                        connection,
                                                        account,
                                                        publicKeyOfCredential,
                                                        credentialHasExpiryDate,
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
                                                        attributes,
                                                        holderId: publicKeyOfCredential,
                                                        issuer: {
                                                            index: credentialRegistryContratIndex,
                                                            subindex: 0,
                                                        },
                                                    };

                                                    const requestSignatureResponse = (await requestSignature(
                                                        seed,
                                                        stringify(commitments)
                                                    )) as RequestSignatureResponse;

                                                    const proofObject = {
                                                        type: 'Ed25519Signature2020' as const,
                                                        verificationMethod: id,
                                                        proofPurpose: 'assertionMethod' as const,
                                                        proofValue:
                                                            requestSignatureResponse.signedCommitments.signature,
                                                    };

                                                    return {
                                                        proof: proofObject,
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
                                Credential Public Key:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="publicKey"
                                    type="text"
                                    placeholder="37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499"
                                    onChange={changePublicKeyHandler}
                                />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setCredentialRegistryState('');
                                        setCredentialRegistryStateError('');
                                        getCredentialEntry(grpcClient, publicKey, credentialRegistryContratIndex)
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
                                header="Step 6: Revoke Credential By The Issuer"
                                note="Expected result after pressing the button: The
                                transaction hash or an error message should appear in the right column."
                            >
                                Credential Public Key:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="publicKey"
                                    type="text"
                                    placeholder="37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499"
                                    onChange={changePublicKeyHandler}
                                />
                                <br />
                                Reason:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="reason"
                                    type="text"
                                    placeholder="ThisShouldBeRevoked"
                                    onChange={changeReasonHandler}
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
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = revokeCredential(
                                            connection,
                                            account,
                                            publicKey,
                                            credentialRegistryContratIndex,
                                            auxiliaryData,
                                            reason
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Revoke Credential
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 7: Restore Credential By The Issuer"
                                note="Expected result after pressing the button: The
                                transaction hash or an error message should appear in the right column."
                            >
                                Credential Public Key:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="publicKey"
                                    type="text"
                                    placeholder="37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499"
                                    onChange={changePublicKeyHandler}
                                />
                                <br />
                                Reason:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="reason"
                                    type="text"
                                    placeholder="ThisShouldBeRestored"
                                    onChange={changeReasonHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = restoreCredential(
                                            connection,
                                            account,
                                            publicKey,
                                            credentialRegistryContratIndex,
                                            reason
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Restore Credential
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 8: Update Issuer Metadata"
                                note="Expected result after pressing the button: The
                                transaction hash or an error message should appear in the right column."
                            >
                                Add `IssuerMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="issuerMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_ISSUER_METADATA}
                                    onChange={changeUpdatedIssuerMetaDataURLHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = updateIssuerMetadata(
                                            connection,
                                            account,
                                            credentialRegistryContratIndex,
                                            updatedIssuerMetaData
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Update Issuer Metadata
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 9: Update Credential Schema"
                                note="Expected result after pressing the button: The
                                transaction hash or an error message should appear in the right column."
                            >
                                {' '}
                                Add `CredentialSchema`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialSchemaURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_SCHEMA}
                                    onChange={changeUpdatedCredentialSchemaURLHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = updateCredentialSchema(
                                            connection,
                                            account,
                                            credentialRegistryContratIndex,
                                            updatedCredentialSchema
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Update Credential Schema
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 10: Update Credential Metadata"
                                note="Expected result after pressing the button: The
                                transaction hash or an error message should appear in the right column."
                            >
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_METADATA}
                                    onChange={changeUpdatedCredentialMetaDataURLHandler}
                                />
                                <br />
                                Credential Public Key:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="publicKey"
                                    type="text"
                                    placeholder="37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499"
                                    onChange={changePublicKeyHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = updateCredentialMetadata(
                                            connection,
                                            account,
                                            credentialRegistryContratIndex,
                                            updatedCredentialMetaDataURL,
                                            publicKey
                                        );

                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Update Credential Metadata
                                </button>
                            </TestBox>
                            <br />
                            <br />
                            <div className="textCenter">Negative Test Scenarios</div>
                            <br />
                            <br />
                            <TestBox
                                header="Step 11: Register a credential (Issuer registers credential with some delay)"
                                note="Expected result after pressing the two buttons: There should be two popups happening in the wallet
                                (first action when pressing the first button to add the credential, second action when pressing the second button to send the `issueCredential` tx to the smart contract).
                                The transaction hash or an error message should appear in the right column and the 
                                credential public key or an error message should appear in the above test unit. 
                                Pressing the button without any user input will create an example tx with the provided placeholder values.
                                Explanation: Since we don't have control over the correctness of a backend when third parties run their own backend,
                                there could be two negative scenarios:
                                - The backend does not successfully register the credential in the smart contract but still returns 
                                the correct signature/randomness/proof on the commitments to the front end.
                                - The backend does successfully register the credential in the smart contract but does not wait until 
                                the transaction is finalized and immediately returns the correct signature/randomness/proof on the commitments 
                                to the front end.
                                This test case allows you to simulate both scenarios reliably by not clicking the second button or
                                by clicking the second button at some point later (delayed). Your credential will be shown in the `Verifiable Credential` 
                                section in the browser wallet after the `issueCredential` tx is finalized."
                            >
                                {attributeSchema.map((item) => (
                                    <div>
                                        Add {item.tag}:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id={item.tag}
                                            name={item.tag}
                                            type="text"
                                            placeholder={item.type === 'string' ? 'myString' : '1234'}
                                            onChange={(event) => {
                                                handleAttributeChange(item.tag, attributeSchema, event);
                                            }}
                                        />
                                        <br />
                                        <br />
                                    </div>
                                ))}
                                <br />
                                <br />
                                <div style={{ fontWeight: credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has expiry date
                                </div>
                                <Switch
                                    onChange={() => {
                                        setCredentialHasExpiryDate(!credentialHasExpiryDate);
                                    }}
                                    onColor="#308274"
                                    offColor="#308274"
                                    onHandleColor="#174039"
                                    offHandleColor="#174039"
                                    checked={!credentialHasExpiryDate}
                                    checkedIcon={false}
                                    uncheckedIcon={false}
                                />
                                <div style={{ fontWeight: !credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has NO expiry date
                                </div>
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
                                {credentialHasExpiryDate && (
                                    <>
                                        Add`valid_until`:
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
                                    </>
                                )}
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_METADATA}
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
                                        setParsingError('');

                                        if (credentialRegistryContratIndex === undefined) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        const attributes: Attribute = {};

                                        attributeSchema.forEach((obj) => {
                                            if (obj.value === undefined) {
                                                setParsingError(`Attribute ${obj.tag} needs to be set.`);
                                                throw new Error(`Attribute ${obj.tag} needs to be set.`);
                                            }

                                            if (obj.type === 'string') {
                                                attributes[obj.tag] = obj.value;
                                            } else if (obj.type === 'number') {
                                                attributes[obj.tag] = BigInt(obj.value);
                                            } else {
                                                setParsingError(
                                                    `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                );
                                                throw new Error(
                                                    `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                );
                                            }
                                        });

                                        const types = Array.from(DEFAULT_CREDENTIAL_TYPES);
                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: 'https://json-schema.org/draft/2020-12/schema',
                                                    type: [...types, credentialType],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: { attributes },
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    const publicKeyOfCredential = id.replace(
                                                        'did:ccd:testnet:pkc:',
                                                        ''
                                                    );

                                                    setCredentialPublicKey(publicKeyOfCredential);

                                                    // Issuer does not register credential here but instead when the next button is pressed.

                                                    const commitments = {
                                                        attributes,
                                                        holderId: publicKeyOfCredential,
                                                        issuer: {
                                                            index: credentialRegistryContratIndex,
                                                            subindex: 0,
                                                        },
                                                    };

                                                    const requestSignatureResponse = (await requestSignature(
                                                        seed,
                                                        stringify(commitments)
                                                    )) as RequestSignatureResponse;

                                                    const proofObject = {
                                                        type: 'Ed25519Signature2020' as const,
                                                        verificationMethod: id,
                                                        proofPurpose: 'assertionMethod' as const,
                                                        proofValue:
                                                            requestSignatureResponse.signedCommitments.signature,
                                                    };

                                                    return {
                                                        proof: proofObject,
                                                        randomness: requestSignatureResponse.randomness,
                                                    };
                                                }
                                            )
                                            .catch((e: Error) => {
                                                console.error(e);
                                            });
                                    }}
                                >
                                    Register Credential in Browser Wallet
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

                                        if (credentialRegistryContratIndex === undefined) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        // Issuer registers credential delayed.

                                        const tx = issueCredential(
                                            connection,
                                            account,
                                            credentialPublicKey,
                                            credentialHasExpiryDate,
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
                                    Issuer sends `issueCredential` Tx
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
                                header="Step 12: Register a credential (Issuer fails to provide correct randomness/signature)"
                                note="Expected result after pressing the button: There should be two popups happening in the wallet
                                (first action to add the credential, second action to send the `issueCredential` tx to the smart contract).
                                The transaction hash or an error message should appear in the right column and the 
                                credential public key or an error message should appear in the above test unit. 
                                Pressing the button without any user input will create an example tx with the provided placeholder values.
                                Your credential should NOT be shown in the `Verifiable Credential` 
                                section in the browser wallet because the randomness/signature is wrong."
                            >
                                {attributeSchema.map((item) => (
                                    <div>
                                        Add {item.tag}:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id={item.tag}
                                            name={item.tag}
                                            type="text"
                                            placeholder={item.type === 'string' ? 'myString' : '1234'}
                                            onChange={(event) => {
                                                handleAttributeChange(item.tag, attributeSchema, event);
                                            }}
                                        />
                                        <br />
                                        <br />
                                    </div>
                                ))}
                                <br />
                                <br />
                                <div style={{ fontWeight: credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has expiry date
                                </div>
                                <Switch
                                    onChange={() => {
                                        setCredentialHasExpiryDate(!credentialHasExpiryDate);
                                    }}
                                    onColor="#308274"
                                    offColor="#308274"
                                    onHandleColor="#174039"
                                    offHandleColor="#174039"
                                    checked={!credentialHasExpiryDate}
                                    checkedIcon={false}
                                    uncheckedIcon={false}
                                />
                                <div style={{ fontWeight: !credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has NO expiry date
                                </div>
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
                                {credentialHasExpiryDate && (
                                    <>
                                        Add`valid_until`:
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
                                    </>
                                )}
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_METADATA}
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
                                        setParsingError('');

                                        if (credentialRegistryContratIndex === undefined) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        const attributes: Attribute = {};

                                        attributeSchema.forEach((obj) => {
                                            if (obj.value === undefined) {
                                                setParsingError(`Attribute ${obj.tag} needs to be set.`);
                                                throw new Error(`Attribute ${obj.tag} needs to be set.`);
                                            }

                                            if (obj.type === 'string') {
                                                attributes[obj.tag] = obj.value;
                                            } else if (obj.type === 'number') {
                                                attributes[obj.tag] = BigInt(obj.value);
                                            } else {
                                                setParsingError(
                                                    `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                );
                                                throw new Error(
                                                    `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                );
                                            }
                                        });

                                        const types = Array.from(DEFAULT_CREDENTIAL_TYPES);

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: 'https://json-schema.org/draft/2020-12/schema',
                                                    type: [...types, credentialType],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: { attributes },
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    const publicKeyOfCredential = id.replace(
                                                        'did:ccd:testnet:pkc:',
                                                        ''
                                                    );

                                                    setCredentialPublicKey(publicKeyOfCredential);

                                                    const tx = issueCredential(
                                                        connection,
                                                        account,
                                                        publicKeyOfCredential,
                                                        credentialHasExpiryDate,
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

                                                    const randomness = {
                                                        Hello: '2d5bbf82232465715f23396f4ece8ccc40ad178b7262d01aad97c9de5380ae07',
                                                        No: '0cc9acd652b6c29aaff42bcf8da242afee622262b0d3e37f17c57ac8d4ae42d9',
                                                        Three: '1fad03391f7c8d72980e53a44e0782f58822eb74f06ff2c7e9e09e6b08f7ca73',
                                                    };

                                                    const proofObject = {
                                                        type: 'Ed25519Signature2020' as const,
                                                        verificationMethod: id,
                                                        proofPurpose: 'assertionMethod' as const,
                                                        proofValue:
                                                            'e8c3944d6a9a19e74ad3ef028b04c0637756540306aba8842000f557cbfb7415187f907d26f20474081d4084fc8e5ff14167171f65fac76b06508ae46f55aa05',
                                                    };

                                                    return { proof: proofObject, randomness };
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
                                header="Step 13: Register a credential (with wrong attributes)"
                                note="Expected result after pressing the button: There should be one popups happening in the wallet
                                    (first action to add the credential, second action to send the `issueCredential` tx to the smart contract).
                                    The transaction hash or an error message should appear in the right column and the 
                                    credential public key or an error message should appear in the above test unit. 
                                    Pressing the button without any user input will create an example tx with the provided placeholder values.
                                    Your credential will be shown in the `Verifiable Credential` 
                                    section in the browser wallet after the `issueCredential` tx is finalized."
                            >
                                {WRONG_ATTRIBUTES.map((item) => (
                                    <div>
                                        Add {item.tag}:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id={item.tag}
                                            name={item.tag}
                                            type="text"
                                            placeholder={item.type === 'string' ? 'myString' : '1234'}
                                            onChange={(event) => {
                                                handleAttributeChange(item.tag, WRONG_ATTRIBUTES, event);
                                            }}
                                        />
                                        <br />
                                        <br />
                                    </div>
                                ))}
                                <br />
                                <br />
                                <div style={{ fontWeight: credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has expiry date
                                </div>
                                <Switch
                                    onChange={() => {
                                        setCredentialHasExpiryDate(!credentialHasExpiryDate);
                                    }}
                                    onColor="#308274"
                                    offColor="#308274"
                                    onHandleColor="#174039"
                                    offHandleColor="#174039"
                                    checked={!credentialHasExpiryDate}
                                    checkedIcon={false}
                                    uncheckedIcon={false}
                                />
                                <div style={{ fontWeight: !credentialHasExpiryDate ? 'bold' : 'normal' }}>
                                    Credential has NO expiry date
                                </div>
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
                                {credentialHasExpiryDate && (
                                    <>
                                        Add`valid_until`:
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
                                    </>
                                )}
                                Add `CredentialMetadata`:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="credentialMetaDataURL"
                                    type="text"
                                    placeholder={EXAMPLE_CREDENTIAL_METADATA}
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
                                    <div style={{ fontWeight: isHolderRevocable ? 'bold' : 'normal' }}>
                                        Holder can revoke credential
                                    </div>
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
                                    <div style={{ fontWeight: !isHolderRevocable ? 'bold' : 'normal' }}>
                                        Holder can NOT revoke credential
                                    </div>
                                </div>
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        setTxHash('');
                                        setTransactionError('');
                                        setCredentialPublicKey('');
                                        setParsingError('');

                                        if (credentialRegistryContratIndex === undefined) {
                                            setTransactionError(`Set Smart Contract Index in Step 3`);
                                            throw new Error(`Set Smart Contract Index in Step 3`);
                                        }

                                        const provider = await detectConcordiumProvider();

                                        const metadataUrl = {
                                            url: credentialMetaDataURL,
                                        };

                                        const attributes: Attribute = {};

                                        attributeSchema.forEach((obj) => {
                                            // if (obj.value === undefined) {
                                            //     setParsingError(`Attribute ${obj.tag} needs to be set.`);
                                            //     throw new Error(`Attribute ${obj.tag} needs to be set.`);
                                            // }

                                            if (obj.value !== undefined) {
                                                if (obj.type === 'string') {
                                                    attributes[obj.tag] = obj.value;
                                                } else if (obj.type === 'number') {
                                                    attributes[obj.tag] = BigInt(obj.value);
                                                } else {
                                                    setParsingError(
                                                        `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                    );
                                                    throw new Error(
                                                        `Attribute ${obj.tag} has type ${obj.type}. Only the types string/number are supported.`
                                                    );
                                                }
                                            }
                                        });

                                        const types = Array.from(DEFAULT_CREDENTIAL_TYPES);

                                        provider
                                            .addWeb3IdCredential(
                                                {
                                                    $schema: 'https://json-schema.org/draft/2020-12/schema',
                                                    type: [...types, credentialType],
                                                    issuer: `did:ccd:testnet:sci:${credentialRegistryContratIndex}:0/issuer`,
                                                    issuanceDate: new Date().toISOString(),
                                                    credentialSubject: { attributes },
                                                    credentialSchema: {
                                                        id: schemaCredential.schema_ref.url,
                                                        type: credentialType,
                                                    },
                                                },
                                                metadataUrl,
                                                async (id) => {
                                                    const publicKeyOfCredential = id.replace(
                                                        'did:ccd:testnet:pkc:',
                                                        ''
                                                    );

                                                    setCredentialPublicKey(publicKeyOfCredential);

                                                    const tx = issueCredential(
                                                        connection,
                                                        account,
                                                        publicKeyOfCredential,
                                                        credentialHasExpiryDate,
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
                                                        attributes,
                                                        holderId: publicKeyOfCredential,
                                                        issuer: {
                                                            index: credentialRegistryContratIndex,
                                                            subindex: 0,
                                                        },
                                                    };

                                                    const requestSignatureResponse = (await requestSignature(
                                                        seed,
                                                        stringify(commitments)
                                                    )) as RequestSignatureResponse;

                                                    const proofObject = {
                                                        type: 'Ed25519Signature2020' as const,
                                                        verificationMethod: id,
                                                        proofPurpose: 'assertionMethod' as const,
                                                        proofValue:
                                                            requestSignatureResponse.signedCommitments.signature,
                                                    };

                                                    return {
                                                        proof: proofObject,
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
                        </div>
                    )}
                    <div className="col-lg-6">
                        <div className="sticky-top">
                            <br />
                            <h5>
                                This column refreshes every few seconds to update your account balance and the smart
                                contract state. It also displays your connected account, your public key, transaction
                                hashes, and error messages.
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
                            {viewErrorAccountBalance && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorAccountBalance}.
                                </div>
                            )}
                            {viewErrorSmartContractState && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorSmartContractState}.
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
                            <br />
                            <br />
                            <br />
                            <div className="label">Smart contract state:</div>
                            <br />
                            <pre className="largeText">{JSON.stringify(smartContractState, null, '\t')}</pre>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
