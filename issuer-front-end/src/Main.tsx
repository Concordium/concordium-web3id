/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useEffect, useState } from 'react';
import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
    useWalletConnectorSelector,
} from '@concordium/react-components';

import { AccountAddress } from '@concordium/web-sdk';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';
import CreateSchemaAndMetadataFiles from './CreateSchemaAndMetadataFiles';
import DeployCredentialContract from './DeployCredentialContract';

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
    const { isConnected, select } = useWalletConnectorSelector(BROWSER_WALLET, connection, {
        ...walletConnectionProps,
    });

    const { connect, connectError } = useConnect(activeConnector, setConnection);

    const [viewErrorAccountBalance, setViewErrorAccountBalance] = useState('');

    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);

    const [isWaitingForTransaction] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

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

    useEffect(() => {
        select();
    }, []);

    return (
        <main className="container">
            <div className="textCenter">
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
                {!isConnected && (
                    <button
                        className="btn btn-primary me-1"
                        type="button"
                        onClick={() => {
                            connect();
                        }}
                    >
                        Connect To Browser Wallet
                    </button>
                )}
                {/* //  )} */}
                {connection && !accountExistsOnNetwork && (
                    <>
                        <div className="alert alert-danger" role="alert">
                            Please ensure that your browser wallet is connected to network{' '}
                            <strong>{walletConnectionProps.network.name}</strong> and you have an account in that wallet
                            that is connected to this website.
                        </div>
                        <div className="alert alert-danger" role="alert">
                            Alternatively, if you intend to use <strong>{isTestnet ? 'mainnet' : 'testnet'}</strong>, go
                            back to step 1 and switch the network button.
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
                            {/* Step 3: Create schema and metadata files */}
                            {active === 3 && <CreateSchemaAndMetadataFiles />}
                            {/* Step 4: Deploy issuer smart contract */}
                            {active === 4 && (
                                <DeployCredentialContract
                                    account={account}
                                    isTestnet={isTestnet}
                                    connection={connection}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
