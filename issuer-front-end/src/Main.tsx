/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import { toBuffer, serializeTypeValue } from '@concordium/web-sdk';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo, getStorageValue, getCredentialEntry } from './reading_from_blockchain';
import { issueCredential, createNewIssuer } from './writing_to_blockchain';

import {
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA,
    CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
    STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA,
} from './constants';

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

export default function Main(props: WalletConnectionProps) {
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } = props;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [viewError, setViewError] = useState('');
    const [signingError, setSigningError] = useState('');
    const [transactionError, setTransactionError] = useState('');

    const [credentialRegistryContratIndex, setCredentialRegistryContratIndex] = useState(0);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialState, setCredentialState] = useState('');
    const [credentialStateError, setCredentialStateError] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    async function addOption(
        options: any,
        setOptions: any,
        schemas: any,
        setSchemas: any,
        credentialSchemaURL: any,
        setCredentialSchemaURL: any,
        newOption: any,
        setOptionInput: any,
        credentialSchemaURLInput: any,
        setCredentialSchemaURLInput: any
    ) {
        if (options.includes(newOption)) {
            throw new Error(`duplicate option ${newOption}`);
        }
        if (newOption) {
            setOptions([...options, newOption]);
            setCredentialSchemaURL([...credentialSchemaURL, credentialSchemaURLInput]);
            setOptionInput('');
            setCredentialSchemaURLInput('');

            setSchemas([
                ...schemas,
                [
                    {
                        credential_type: newOption,
                    },
                    {
                        schema_ref: {
                            hash: {
                                None: [],
                            },
                            url: credentialSchemaURLInput,
                        },
                    },
                ],
            ]);
        }
    }

    async function addRevokationKey(
        revocationKeys: any,
        setRevocationKeys: any,
        setRevoationKeyInput: any,
        newRevocationKey: any
    ) {
        if (revocationKeys.includes(newRevocationKey)) {
            throw new Error(`duplicate option ${newRevocationKey}`);
        }
        if (newRevocationKey) {
            setRevocationKeys([...revocationKeys, newRevocationKey]);
            setRevoationKeyInput('');
        }
    }

    const newSignatureExampleInput = {
        contract_address: {
            index: Number(CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX),
            subindex: 0,
        },
        encrypted_credential: [3, 35, 25],
        metadata: [34],
        timestamp: '2030-08-08T05:15:00Z',
    };

    const newRegisterCredentialExampleInput = {
        credential_info: {
            holder_id: '9cfb82e0b2c6a4c63e586e3f97796c14ddef1d431ae8cf73f5bed067f412cc90',
            holder_revocable: true,
            commitment: [4, 2, 52, 3],
            valid_from: '2030-08-08T05:15:00Z',
            valid_until: {
                Some: ['2030-08-08T05:15:00Z'],
            },
            credential_type: {
                credential_type: 'myType',
            },
            metadata_url: {
                hash: {
                    None: [],
                },
                url: 'https://credential/metaData/',
            },
        },
        auxiliary_data: [1, 2],
    };

    const [signature, setSignature] = useState('');
    const [registerCredentialInput, setRegisterCredentialInput] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [signatureInput, setSignatureInput] = useState('');
    const [object, setObject] = useState();
    const [browserPublicKey, setBrowserPublicKey] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState('');

    const [revocationKeys, setRevocationKeys] = useState([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState('');

    const [schemas, setSchemas] = useState([]);
    const [options, setOptions] = useState([]);
    const [credentialSchemaURL, setCredentialSchemaURL] = useState([]);
    const [optionInput, setOptionInput] = useState('myType');
    const [credentialSchemaURLInput, setCredentialSchemaURLInput] = useState('https://credentialSchema/metaData/');

    const changeNewRegisterCredentialInputHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('newRegisterCredentialInput');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;
        setRegisterCredentialInput(JSON.parse(target.value));
    };

    const changeSignatureInputHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('newSignatureInput');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;
        setSignatureInput(JSON.parse(target.value));
    };

    const changePublicKeyHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setPublicKey(target.value);
    };

    const changeIssuerMetaDataURLHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
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
    }, [connection]);

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
                                Input issuer metadata:
                                <br />
                                <input
                                    className="inputFieldStyle"
                                    id="issuerMetaDataURL"
                                    type="text"
                                    placeholder="https://issuer/metaData/"
                                    onChange={changeIssuerMetaDataURLHandler}
                                />
                                {options.length !== 0 && (
                                    <>
                                        <div>You have added the following `CredentialSchemaType`:</div>
                                        <div>
                                            {options?.map((element) => (
                                                <li key={element}>{element}</li>
                                            ))}
                                        </div>
                                        <div>You have added the following `CredentialSchemaURL`:</div>
                                        <div>
                                            {credentialSchemaURL?.map((element) => (
                                                <li key={element}>{element}</li>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <br />
                                <Form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        addOption(
                                            options,
                                            setOptions,
                                            schemas,
                                            setSchemas,
                                            credentialSchemaURL,
                                            setCredentialSchemaURL,
                                            optionInput,
                                            setOptionInput,
                                            credentialSchemaURLInput,
                                            setCredentialSchemaURLInput
                                        ).catch(console.error);
                                    }}
                                >
                                    <div>Add pairs of `CredentialSchemaType` and `CredentialSchemaURL`:</div>
                                    <Row>
                                        <Col sm={10}>
                                            <InputGroup className="mb-3">
                                                <Form.Control
                                                    placeholder="CredentialSchemaType"
                                                    value={optionInput}
                                                    onChange={(e) => setOptionInput(e.target.value)}
                                                />
                                                <Form.Control
                                                    placeholder="CredentialSchemaURL"
                                                    value={credentialSchemaURLInput}
                                                    onChange={(e) => setCredentialSchemaURLInput(e.target.value)}
                                                />

                                                <Button type="submit" variant="outline-secondary">
                                                    Add
                                                </Button>
                                            </InputGroup>
                                        </Col>
                                        <Col sm={1}>
                                            <Button variant="outline-secondary" onClick={() => setOptions([])}>
                                                Clear
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>
                                {revocationKeys.length !== 0 && (
                                    <>
                                        <div>You have added the following `revocationKeys`:</div>
                                        <div>
                                            {revocationKeys?.map((element) => (
                                                <li key={element}>{element}</li>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <br />
                                <Form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        addRevokationKey(
                                            revocationKeys,
                                            setRevocationKeys,
                                            setRevocationKeyInput,
                                            revocationKeyInput
                                        ).catch(console.error);
                                    }}
                                >
                                    <div>Add `revocationKeys`:</div>
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
                                            <Button variant="outline-secondary" onClick={() => setRevocationKeys([])}>
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
                                            JSON.stringify(schemas),
                                            JSON.stringify(revocationKeys)
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
                                header="Step 3: Sign Storage Contract Message"
                                note="
                                Expected result after pressing button and confirming in wallet: A signature or
                                an error message should appear in the above test unit.
                                        "
                            >
                                <textarea id="newSignatureInput" onChange={changeSignatureInputHandler}>
                                    Copy below object in here and adjust.
                                </textarea>
                                <pre className="largeText">{JSON.stringify(newSignatureExampleInput, null, '\t')}</pre>

                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        const serializedMessage = serializeTypeValue(
                                            signatureInput,
                                            toBuffer(STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA, 'base64')
                                        );
                                        setSigningError('');
                                        setSignature('');
                                        const promise = connection.signMessage(account, {
                                            type: 'BinaryMessage',
                                            value: serializedMessage,
                                            schema: {
                                                type: 'TypeSchema',
                                                value: toBuffer(
                                                    STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA,
                                                    'base64'
                                                ),
                                            },
                                        });
                                        promise
                                            .then((permitSignature) => {
                                                setSignature(permitSignature[0][0]);
                                            })
                                            .catch((err: Error) => setSigningError((err as Error).message));
                                    }}
                                >
                                    Sign Storage Contract Message
                                </button>
                                {signingError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {signingError}.
                                    </div>
                                )}
                                {signature !== '' && (
                                    <div className="actionResultBox">
                                        <div> Your generated signature is: </div>
                                        <br />
                                        <div>{signature}</div>
                                    </div>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 4: Register Credential (the signature is NOT checked in the storage contract because the browser wallet cannot sign with the prefix `WEB3ID:STORE` yet)"
                                note="Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column."
                            >
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        const storageInputParameter = {
                                            data: signatureInput,
                                            public_key: browserPublicKey,
                                            signature,
                                        };

                                        const serializedMessage = serializeTypeValue(
                                            storageInputParameter,
                                            toBuffer(STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA, 'base64')
                                        );
                                        const createdObject = newRegisterCredentialExampleInput;

                                        createdObject.auxiliary_data = Array.from(serializedMessage);
                                        createdObject.credential_info.holder_id = browserPublicKey;

                                        setObject(JSON.parse(JSON.stringify(createdObject, null, '\t')));
                                    }}
                                >
                                    Create object
                                </button>
                                <textarea
                                    id="newRegisterCredentialInput"
                                    onChange={changeNewRegisterCredentialInputHandler}
                                >
                                    Copy below object in here and adjust.
                                </textarea>
                                <pre className="largeText">{JSON.stringify(object, null, '\t')}</pre>
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = issueCredential(
                                            connection,
                                            account,
                                            JSON.stringify(registerCredentialInput),
                                            credentialRegistryContratIndex
                                        );
                                        tx.then(setTxHash).catch((err: Error) => {
                                            setTransactionError((err as Error).message);
                                        });
                                    }}
                                >
                                    Register Credential
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 5: View Public Key in Storage Contract"
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
                                        setCredentialState('');
                                        setCredentialStateError('');
                                        withJsonRpcClient(connection, (rpcClient) =>
                                            getStorageValue(rpcClient, publicKey)
                                        )
                                            .then((value) => {
                                                if (value !== undefined) {
                                                    setCredentialState(JSON.parse(value));
                                                }
                                            })
                                            .catch((e) => {
                                                setCredentialStateError((e as Error).message);
                                            });
                                    }}
                                >
                                    View Public Key in Storage Contract
                                </button>
                                {credentialState !== '' && (
                                    <div className="actionResultBox">
                                        <div>Your return value is:</div>
                                        <br />

                                        <pre className="largeText">{JSON.stringify(credentialState, null, '\t')}</pre>
                                    </div>
                                )}
                                {!credentialState && credentialStateError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {credentialStateError}.
                                    </div>
                                )}
                            </TestBox>
                            <TestBox
                                header="Step 6: View Credential Entry in Registry Contract"
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
                                <div className="alert alert-danger" role="alert">
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
