import React, { useState } from 'react';

import { TESTNET, MAINNET, WithWalletConnector } from '@concordium/react-components';
import Switch from 'react-switch';
import Main from './Main';
import { version } from '../package.json';

/**
 * Connect to wallet, setup application state context, and render children when the wallet API is ready for use.
 */
export default function Root() {
    const [isTestnet, setIsTestnet] = useState(true);

    return (
        <div>
            <main className="textCenter">
                <br />
                <div className="version">Version: {version}</div>
                <h1>Web3Id Issuer Front End {isTestnet ? 'Testnet' : 'Mainnet'}</h1>
                <br />
                <div className="switch-wrapper">
                    <div>Testnet</div>
                    <Switch
                        onChange={() => {
                            setIsTestnet(!isTestnet);
                        }}
                        onColor="#308274"
                        offColor="#308274"
                        onHandleColor="#174039"
                        offHandleColor="#174039"
                        checked={!isTestnet}
                        checkedIcon={false}
                        uncheckedIcon={false}
                    />
                    <div>Mainnet</div>
                </div>
                <br />
                <WithWalletConnector network={isTestnet ? TESTNET : MAINNET}>
                    {(props) => <Main walletConnectionProps={props} isTestnet={isTestnet} />}
                </WithWalletConnector>
            </main>
        </div>
    );
}
