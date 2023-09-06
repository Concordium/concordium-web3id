/* eslint-disable no-console */
import React, { useState } from 'react';

import { TESTNET, MAINNET, WithWalletConnector, WalletConnectionProps } from '@concordium/react-components';
import Main from './Main';
import { version } from '../package.json';
import SelectNetwork from './SelectNetwork';

export default function Root() {
    const [isTestnet, setIsTestnet] = useState<boolean | undefined>(undefined);
    const [active, setActive] = useState(1);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isNextButtonDisabled, setIsNextButtonDisabled] = useState<boolean>(true);
    const [isPreviousButtonDisabled, setIsPreviousButtonDisabled] = useState<boolean>(true);

    const updateProgress = (activeValue: number) => {
        const progressBar = document.getElementById('progress-bar');
        const steps = document.querySelectorAll('.step');

        // toggle active class on list items
        steps.forEach((step, i) => {
            if (i < activeValue) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
        if (progressBar !== null) {
            // set progress bar width
            progressBar.style.width = `${((activeValue - 1) / (steps.length - 1)) * 100}%`;

            if (activeValue === 2 && isConnected === false) {
                setIsNextButtonDisabled(true);
            }

            // enable/disable prev and next buttons
            if (activeValue === 1) {
                setIsPreviousButtonDisabled(true);
            } else if (activeValue === steps.length) {
                setIsNextButtonDisabled(true);
            } else {
                setIsPreviousButtonDisabled(false);
                setIsNextButtonDisabled(false);
            }
        }
    };

    const next = (activeValue: number, setActiveHook: (arg0: number) => void) => {
        const steps = document.querySelectorAll('.step');

        let newActiveValue = 1;
        if (activeValue + 1 <= steps.length) {
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

    const stepHeaders = ['Select Network', 'Connect Wallet', 'Create MetaData Files', 'Deploy Issuer Smart Contract'];

    return (
        <div>
            <main className="textCenter">
                <br />
                {isTestnet === undefined && <h1>Web3Id Issuer Front End</h1>}
                {isTestnet !== undefined && <h1>Web3Id Issuer Front End {isTestnet ? '(Testnet)' : '(Mainnet)'}</h1>}
                <h3>
                    Step {active}: {stepHeaders[active - 1]}
                </h3>
                <br />
                <div id="progress">
                    <div id="progress-bar" />
                    <ul id="progress-num">
                        <li className="step active">1</li>
                        <li className="step">2</li>
                        <li className="step">3</li>
                        <li className="step">4</li>
                    </ul>
                </div>

                {/* Step 1: Select Network */}
                {active === 1 && (
                    <SelectNetwork setIsNextButtonDisabled={setIsNextButtonDisabled} setIsTestnet={setIsTestnet} />
                )}
                {/* Step 2, 3, and 4 */}
                {(active === 2 || active === 3 || active === 4) && isTestnet !== undefined && (
                    <>
                        <WithWalletConnector network={isTestnet ? TESTNET : MAINNET}>
                            {(props: WalletConnectionProps) => {
                                const { connectedAccounts } = props;
                                setIsConnected(connectedAccounts.size > 0);
                                setIsNextButtonDisabled(!(connectedAccounts.size > 0));

                                return <Main active={active} walletConnectionProps={props} isTestnet={isTestnet} />;
                            }}
                        </WithWalletConnector>
                        <br />
                    </>
                )}
                <br />
                <br />
                <button
                    className="btn btn-primary"
                    id="progress-prev"
                    type="button"
                    disabled={isPreviousButtonDisabled}
                    onClick={() => previous(active, setActive)}
                >
                    {previousText}
                </button>
                <button
                    className="btn btn-primary"
                    id="progress-next"
                    type="button"
                    disabled={isNextButtonDisabled}
                    onClick={() => next(active, setActive)}
                >
                    {nextText}
                </button>
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
