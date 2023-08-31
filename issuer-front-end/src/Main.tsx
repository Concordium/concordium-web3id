/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useCallback } from 'react';
import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
} from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { AccountAddress, TransactionKindString, TransactionSummaryType } from '@concordium/web-sdk';
import { TailSpin } from 'react-loader-spinner';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { createNewIssuer } from './writing_to_blockchain';

import { EXAMPLE_CREDENTIAL_SCHEMA, BROWSER_WALLET, REFRESH_INTERVAL, EXAMPLE_ISSUER_METADATA } from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
    note: string;
}>;

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

interface ConnectionProps {
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
    active: number;
}

export default function Main(props: ConnectionProps) {
    const { walletConnectionProps, isTestnet, active } = props;
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } =
        walletConnectionProps;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [smartContractIndex, setSmartContractIndex] = useState('');
    const [smartContractIndexError, setSmartContractIndexError] = useState('');
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState('');
    const [waitingForTransactionToFinialize, setWaitingForTransactionToFinialize] = useState(false);

    const [viewErrorAccountBalance, setViewErrorAccountBalance] = useState('');
    const [transactionError, setTransactionError] = useState('');
    const [userInputError2, setUserInputError2] = useState('');

    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [issuerKey, setIssuerKey] = useState<string | undefined>(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const [accountBalance, setAccountBalance] = useState('');
    const [txHash, setTxHash] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState(EXAMPLE_ISSUER_METADATA);

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

    const changeIssuerMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
    }, []);

    const changeIssuerKeyHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerKey(target.value);
    }, []);

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

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

    const changeCredentialTypeHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialType(target.value);
    }, []);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHash !== '') {
            const interval = setInterval(() => {
                console.log('refreshing_smartContractIndex');
                client
                    .getBlockItemStatus(txHash)
                    .then((report) => {
                        if (report !== undefined) {
                            setViewErrorModuleReference('');
                            if (report.status === 'finalized') {
                                setWaitingForTransactionToFinialize(false);
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndexError('');
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setViewErrorModuleReference((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client, txHash]);

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                client
                    ?.getAccountInfo(new AccountAddress(account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                            setAccountExistsOnNetwork(true);
                        }
                        setViewErrorAccountBalance('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setViewErrorAccountBalance((e as Error).message.replaceAll('%20', ' '));
                        setAccountExistsOnNetwork(false);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    useEffect(() => {
        if (connection && account) {
            client
                ?.getAccountInfo(new AccountAddress(account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                        setAccountExistsOnNetwork(true);
                    }
                    setViewErrorAccountBalance('');
                })
                .catch((e) => {
                    setViewErrorAccountBalance((e as Error).message.replaceAll('%20', ' '));
                    setAccountBalance('');
                    setAccountExistsOnNetwork(false);
                });
        }
    }, [connection, account]);

    return (
        <main className="container">
            <div className="textCenter">
                <WalletConnectionTypeButton
                    connectorType={BROWSER_WALLET}
                    connectorName="Browser Wallet"
                    setWaitingForUser={setWaitingForUser}
                    connection={connection}
                    {...walletConnectionProps}
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
                {connection && !accountExistsOnNetwork && (
                    <>
                        <div className="alert alert-danger" role="alert">
                            Please ensure that your browser wallet is connected to network `
                            {walletConnectionProps.network.name}` and you have an account in that wallet that is
                            connected to this website.
                        </div>
                        <div className="alert alert-danger" role="alert">
                            Alternatively, if you intend to use `{isTestnet ? 'mainnet' : 'testnet'}`, go back to step 1
                            and switch the network button.
                        </div>
                    </>
                )}
            </div>
            {account && (
                <div className="row">
                    {connection && account !== undefined && (
                        <div>
                            <br />
                            <div className="label">Connected account:</div>
                            <div>
                                <div>
                                    <a
                                        className="link"
                                        href={`https://${
                                            isTestnet ? `testnet.` : ``
                                        }ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {account}
                                    </a>
                                </div>
                            </div>
                            <br />
                            <div className="label">Your account balance:</div>
                            <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                            <br />
                            {viewErrorAccountBalance && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorAccountBalance}.
                                </div>
                            )}
                            {active === 4 && (
                                <TestBox header="" note="">
                                    Add `IssuerKey`:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="issuerKey"
                                        type="text"
                                        value={issuerKey}
                                        onChange={changeIssuerKeyHandler}
                                    />
                                    <br />
                                    <br />
                                    Add `IssuerMetadata`:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="issuerMetaDataURL"
                                        type="text"
                                        value={issuerMetaData}
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
                                        value={credentialType}
                                        onChange={changeCredentialTypeHandler}
                                    />
                                    <br />
                                    <br />
                                    Add `CredentialSchema`:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="credentialSchemaURL"
                                        type="text"
                                        value={schemaCredential.schema_ref.url}
                                        onChange={changeCredentialSchemaURLHandler}
                                    />
                                    <br />
                                    <br />
                                    {revocationKeys.length !== 0 && (
                                        <>
                                            <div className="actionResultBox">
                                                <div>You have added the following `revocationKeys`:</div>
                                                <div>
                                                    {revocationKeys?.map((element) => (
                                                        <li key={element}>{element}</li>
                                                    ))}
                                                </div>
                                            </div>
                                            <br />
                                            <br />
                                        </>
                                    )}
                                    {userInputError2 !== '' && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {userInputError2}.
                                        </div>
                                    )}
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
                                            setSmartContractIndex('');
                                            setWaitingForTransactionToFinialize(true);

                                            const schemaCredentialURL = schemaCredential.schema_ref.url;

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
                                                issuerKey || '',
                                                schemaCredentialURL === '' ? exampleCredentialSchema : schemaCredential,
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
                                    <br />
                                    <br />
                                    {!txHash && transactionError && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {transactionError}.
                                        </div>
                                    )}
                                    {smartContractIndexError !== '' && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {smartContractIndexError}.
                                        </div>
                                    )}
                                    {viewErrorModuleReference && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {viewErrorModuleReference}.
                                        </div>
                                    )}
                                    {txHash && (
                                        <div>
                                            <div>Transaction hash:</div>
                                            <a
                                                className="link"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`https://${
                                                    isTestnet ? `testnet.` : ``
                                                }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHash}`}
                                            >
                                                {txHash}
                                            </a>
                                        </div>
                                    )}
                                    <br />
                                    <br />
                                    {waitingForTransactionToFinialize === true && (
                                        <div className="containerTwoItems">
                                            <TailSpin
                                                height="30"
                                                width="30"
                                                color="#308274"
                                                ariaLabel="tail-spin-loading"
                                                radius="1"
                                                wrapperStyle={{}}
                                                wrapperClass=""
                                                visible
                                            />
                                            <div>Waiting for transaction to finalize</div>
                                        </div>
                                    )}
                                    {smartContractIndex !== '' && (
                                        <div className="actionResultBox">
                                            Smart Contract Index:
                                            <div>{smartContractIndex}</div>
                                        </div>
                                    )}
                                </TestBox>
                            )}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
