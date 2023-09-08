/* eslint-disable no-console */
import React, { useState } from 'react';

import { TESTNET, MAINNET, WithWalletConnector, WalletConnectionProps } from '@concordium/react-components';
import Main from './Main';
import { version } from '../package.json';
import SelectNetwork from './SelectNetwork';
import CreateSchemaAndMetadataFiles from './CreateSchemaAndMetadataFiles';

export default function Root() {
    const [isTestnet, setIsTestnet] = useState<boolean | undefined>(undefined);
    const [active, setActive] = useState(1);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isNextButtonDisabled, setIsNextButtonDisabled] = useState<boolean>(false);
    const [isPreviousButtonDisabled, setIsPreviousButtonDisabled] = useState<boolean>(true);

    const updateProgress = (activeValue: number) => {
        if (activeValue === 2 && isConnected === false) {
            setIsNextButtonDisabled(true);
        }

        if (activeValue === 3) {
            setIsNextButtonDisabled(true);
        }

        // enable/disable prev and next buttons
        if (activeValue === 1) {
            setIsPreviousButtonDisabled(true);
            setIsNextButtonDisabled(false);
        } else if (activeValue === 3) {
            setIsNextButtonDisabled(true);
        } else {
            setIsPreviousButtonDisabled(false);
            setIsNextButtonDisabled(false);
        }
    };

    const next = (activeValue: number, setActiveHook: (arg0: number) => void) => {
        let newActiveValue = 1;
        if (activeValue + 1 <= 3) {
            newActiveValue = activeValue + 1;
        } else {
            newActiveValue = activeValue;
        }
        updateProgress(newActiveValue);

        setActiveHook(newActiveValue);
    };

    const previous = (activeValue: number, setActiveHook: (arg0: number) => void) => {
        let newActiveValue = 1;
        if (activeValue - 1 >= 1) {
            newActiveValue = activeValue - 1;
        } else {
            newActiveValue = 1;
        }
        updateProgress(newActiveValue);

        setActiveHook(newActiveValue);
    };

    const previousText = `<<<<<<`;
    const nextText = `>>>>>>`;

    const stepHeaders = ['Create MetaData Files', 'Select Network', 'Connect Wallet', 'Deploy Issuer Smart Contract'];

    return (
        <div>
            <main id="#root">
                <br />
                {isTestnet === undefined && <h1>Web3Id Issuer Front End</h1>}
                {isTestnet !== undefined && <h1>Web3Id Issuer Front End {isTestnet ? '(Testnet)' : '(Mainnet)'}</h1>}
                <h3>
                    Step {active}: {stepHeaders[active - 1]}
                </h3>
                <br />
                {/* Step 1: Create schema and metadata files */}
                {active === 1 && <CreateSchemaAndMetadataFiles />}
                {/* Step 2: Select Network */}
                {active === 2 && (
                    <SelectNetwork setIsNextButtonDisabled={setIsNextButtonDisabled} setIsTestnet={setIsTestnet} />
                )}
                {/* Step 3 */}
                {active === 3 && isTestnet !== undefined && (
                    <>
                        <WithWalletConnector network={isTestnet ? TESTNET : MAINNET}>
                            {(props: WalletConnectionProps) => {
                                const { connectedAccounts } = props;
                                setIsConnected(connectedAccounts.size > 0);

                                return (
                                    <Main
                                        progress={() => next(active, setActive)}
                                        walletConnectionProps={props}
                                        isTestnet={isTestnet}
                                    />
                                );
                            }}
                        </WithWalletConnector>
                        <br />
                    </>
                )}
                <br />
                <br />
                <br />
                <br />
                <nav aria-label="Page navigation example">
                    <ul className="pagination">
                        <button
                            className="btn btn-primary"
                            type="button"
                            disabled={isPreviousButtonDisabled}
                            onClick={() => previous(active, setActive)}
                        >
                            {previousText}
                        </button>
                        <li className={active === 1 ? 'page-item active' : 'page-item'}>
                            <div className="page-link">Step 1</div>
                        </li>
                        <li className={active === 2 ? 'page-item active' : 'page-item'}>
                            <div className="page-link">Step 2</div>
                        </li>
                        <li className={active === 3 ? 'page-item active' : 'page-item'}>
                            <div className="page-link">Step 3</div>
                        </li>
                        <button
                            className="btn btn-primary"
                            type="button"
                            disabled={isNextButtonDisabled}
                            onClick={() => next(active, setActive)}
                        >
                            {nextText}
                        </button>
                    </ul>
                </nav>

                <div>
                    <br />
                    Version: {version} |{' '}
                    <a
                        href="https://developer.concordium.software/en/mainnet/net/guides/create-proofs.html"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Learn more about web3ID here
                    </a>
                    <br />
                </div>
            </main>
            <br />
            <br />
        </div>
    );
}
