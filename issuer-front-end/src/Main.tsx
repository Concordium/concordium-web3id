/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import { toBuffer, serializeTypeValue } from '@concordium/web-sdk';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo, getStorageValue, getCredentialEntry } from './reading_from_blockchain';
import { issueCredential, createNewIssuer } from './writing_to_blockchain';

import {
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA,
    CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
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

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialState, setCredentialState] = useState('');
    const [credentialStateError, setCredentialStateError] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    const newIssuerExampleInput = {
        issuer_metadata: {
            hash: {
                None: [],
            },
            url: 'https://issuer/metaData/',
        },
        storage_address: {
            index: Number(CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX),
            subindex: 0,
        },
        schemas: [
            [
                {
                    credential_type: 'myType',
                },
                {
                    schema_ref: {
                        hash: {
                            None: [],
                        },
                        url: 'https://credentialSchema/metaData/',
                    },
                },
            ],
        ],
        issuer: {
            Some: ['3LybnyGG4th6g4s8tv6Dt68pdW3wHASnfhiC7MhCxNfdVTATny'],
        },
        revocation_keys: ['37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499'],
    };

    const [input, setInput] = useState(newIssuerExampleInput);

    const [toAccount, setToAccount] = useState('');
    const [signature, setSignature] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const changeNewIssuerInputHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('newIssuerInput');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;
        setInput(JSON.parse(target.value));
    };

    const changeInputHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setInput(JSON.parse(target.value));
    };

    const changePublicKeyHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setPublicKey(target.value);
    };

    const changeToAccountHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setToAccount(target.value);
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
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
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
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setAccountBalance('');
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
                                <div className="switch-wrapper" />
                                <textarea id="newIssuerInput" onChange={changeNewIssuerInputHandler}>
                                    Copy below object in here and adjust.
                                </textarea>
                                <pre className="largeText">{JSON.stringify(newIssuerExampleInput, null, '\t')}</pre>
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = createNewIssuer(connection, account, JSON.stringify(input));
                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Create New Issuer
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 2: Sign Storage Contract Message"
                                note="
                                        Expected result after pressing button and confirming in wallet: A signature or
                                        an error message should appear in the above test unit.
                                        "
                            >
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        const signMessage = {
                                            contract_address: {
                                                index: CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
                                                subindex: 0,
                                            },
                                            encrypted_credential: [3, 35, 25],
                                            metadata: [34],
                                            timestamp: '2030-08-08T05:15:00Z',
                                        };

                                        const serializedMessage = serializeTypeValue(
                                            signMessage,
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
                                header="Step 3: Register Credential"
                                note="Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column."
                            >
                                <input
                                    className="inputFieldStyle"
                                    id="input"
                                    type="text"
                                    placeholder="5"
                                    onChange={changeInputHandler}
                                />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        // const tx = issueCredential(connection, account, input, signature);
                                        // tx.then(setTxHash).catch((err: Error) => {
                                        //     console.log(err);
                                        //     setTransactionError((err as Error).message);
                                        // });
                                    }}
                                >
                                    Register Credential
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 4: View Public Key in Storage Contract"
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
                                header="Step 5: View Credential Entry in Registry Contract"
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
                                            getCredentialEntry(rpcClient, publicKey)
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
                                displays your connected account, transaction hashes, and error messages.
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
