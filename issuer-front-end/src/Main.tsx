/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import { toBuffer, serializeTypeValue } from '@concordium/web-sdk';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { smartContractInfo, accountInfo, view } from './reading_from_blockchain';
import { issueCredential, createNewIssuer, registerCredentialSchema } from './writing_to_blockchain';

import {
    CONTRACT_INDEX,
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

    const [record, setRecord] = useState('');
    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');
    const [smartContractBalance, setSmartContractBalance] = useState('');

    const [input, setInput] = useState('');

    const [toAccount, setToAccount] = useState('');
    const [signature, setSignature] = useState('');

    const [txHash, setTxHash] = useState('');

    const changeInputHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setInput(target.value);
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
                console.log('refreshing1');
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

    // Refresh smartContractInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection) {
            const interval = setInterval(() => {
                console.log('refreshing2');
                withJsonRpcClient(connection, (rpcClient) => smartContractInfo(rpcClient))
                    .then((value) => {
                        if (value !== undefined) {
                            setSmartContractBalance(value.amount.microCcdAmount.toString());
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setSmartContractBalance('');
                        setViewError((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    // Refresh view periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                console.log('refreshing3');
                withJsonRpcClient(connection, (rpcClient) => view(rpcClient))
                    .then((value) => {
                        if (value !== undefined) {
                            setRecord(JSON.parse(value));
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setRecord('');
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

    useEffect(() => {
        if (connection && account) {
            withJsonRpcClient(connection, (rpcClient) => smartContractInfo(rpcClient))
                .then((value) => {
                    if (value !== undefined) {
                        setSmartContractBalance(value.amount.microCcdAmount.toString());
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setSmartContractBalance('');
                });
        }
    }, [connection]);

    useEffect(() => {
        if (connection && account) {
            withJsonRpcClient(connection, (rpcClient) => view(rpcClient))
                .then((value) => {
                    if (value !== undefined) {
                        setRecord(JSON.parse(value));
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setRecord('');
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
                        <>
                            <div className="col-lg-4">
                                <div className="sticky-top">
                                    <div className="inputFormatBox">
                                        <h3>Expected input parameter format:</h3>
                                        <ul>
                                            <li>
                                                <b>u8</b> (e.g. 5)
                                            </li>
                                            <li>
                                                <b>u16</b> (e.g. 15)
                                            </li>
                                            <li>
                                                <b>Address</b> (e.g
                                                &#123;&#34;Contract&#34;:[&#123;&#34;index&#34;:3,&#34;subindex&#34;:0&#125;]&#125;
                                                or
                                                &#123;&#34;Account&#34;:[&#34;4fUk1a1rjBzoPCCy6p92u5LT5vSw9o8GpjMiRHBbJUfmx51uvt&#34;]&#125;
                                                )
                                            </li>
                                            <li>
                                                <b>ContractAddress</b> (e.g.
                                                &#123;&#34;index&#34;:3,&#34;subindex&#34;:0&#125;)
                                            </li>
                                            <li>
                                                <b>AccountAddress</b> (e.g.
                                                4fUk1a1rjBzoPCCy6p92u5LT5vSw9o8GpjMiRHBbJUfmx51uvt)
                                            </li>
                                            <li>
                                                <b>Hash</b> (e.g.
                                                18ee24150dcb1d96752a4d6dd0f20dfd8ba8c38527e40aa8509b7adecf78f9c6)
                                            </li>
                                            <li>
                                                <b>Public key</b> (e.g.
                                                37a2a8e52efad975dbf6580e7734e4f249eaa5ea8a763e934a8671cd7e446499)
                                            </li>
                                            <li>
                                                <b>Signature</b> (e.g.
                                                632f567c9321405ce201a0a38615da41efe259ede154ff45ad96cdf860718e79bde07cff72c4d119c644552a8c7f0c413f5cf5390b0ea0458993d6d6374bd904)
                                            </li>
                                            <li>
                                                <b>Timestamp</b> (e.g. 2030-08-08T05:15:00Z)
                                            </li>
                                            <li>
                                                <b>String</b> (e.g. aaa)
                                            </li>
                                            <li>
                                                <b>Option (None)</b> (e.g. no input required)
                                            </li>
                                            <li>
                                                <b>Option (Some)</b> (e.g. 3)
                                            </li>
                                            <li>
                                                <b>Wrong schema</b> (e.g. 5)
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div className="col-lg-4">
                                <TestBox
                                    header="Step 1: Create New Issuer"
                                    note="
                                        Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column.
                                        "
                                >
                                    <div className="switch-wrapper" />
                                    <label className="field">
                                        Input parameter:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="input"
                                            type="text"
                                            placeholder="5"
                                            onChange={changeInputHandler}
                                        />
                                    </label>
                                    <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={() => {
                                            setTxHash('');
                                            setTransactionError('');
                                            const tx = createNewIssuer(connection, account, input);
                                            tx.then(setTxHash).catch((err: Error) =>
                                                setTransactionError((err as Error).message)
                                            );
                                        }}
                                    >
                                        Create New Issuer
                                    </button>
                                </TestBox>
                                <TestBox
                                    header="Step 2: Register Schema of Credential"
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
                                            const tx = registerCredentialSchema(connection, account, input);
                                            tx.then(setTxHash).catch((err: Error) => {
                                                console.log(err);
                                                setTransactionError((err as Error).message);
                                            });
                                        }}
                                    >
                                        Register Schema of Credential
                                    </button>
                                </TestBox>
                                <TestBox
                                    header="Step 4: Sign Storage Contract Message"
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
                                                toBuffer(
                                                    STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA,
                                                    'base64'
                                                )
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
                                    header="Step 4: Register Credential"
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
                                            const tx = issueCredential(connection, account, input, signature);
                                            tx.then(setTxHash).catch((err: Error) => {
                                                console.log(err);
                                                setTransactionError((err as Error).message);
                                            });
                                        }}
                                    >
                                        Register Credential
                                    </button>
                                </TestBox>
                            </div>
                        </>
                    )}
                    <div className="col-lg-4">
                        <div className="sticky-top">
                            <h5>
                                This column refreshes every few seconds and displays balances, smart contract state,
                                transaction hashes, and error messages.
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
                                Smart contract balance (index: {CONTRACT_INDEX.toString()}, subindex: 0):
                            </div>
                            <div>{smartContractBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                            <br />
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
                            <br />
                            <br />
                            <div className="label">Smart contract state:</div>
                            <pre className="largeText">{JSON.stringify(record, null, '\t')}</pre>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
