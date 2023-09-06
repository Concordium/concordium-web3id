/* eslint-disable no-console */
/* eslint-disable no-alert */
import React, { ChangeEvent, Dispatch, SetStateAction, useEffect } from 'react';
import { MODULE_REFERENCE_CREDENTIAL_REGISTRY } from './constants';

interface ConnectionProps {
    setIsTestnet: Dispatch<SetStateAction<boolean | undefined>>;
    setIsNextButtonDisabled: Dispatch<SetStateAction<boolean>>;
}

export default function SelectNetwork(props: ConnectionProps) {
    const { setIsTestnet, setIsNextButtonDisabled } = props;

    const changeDropDownHandler = (e: ChangeEvent) => {
        const element = e.target as HTMLSelectElement;
        const { value } = element;

        if (value === 'Testnet') {
            setIsTestnet(true);
        } else if (value === 'Mainnet') {
            setIsTestnet(false);
        } else {
            console.error('Select a network');
            alert('Select a network');
            return;
        }

        setIsNextButtonDisabled(false);
    };

    useEffect(() => {
        setIsTestnet(undefined);
        setIsNextButtonDisabled(true);
    }, []);

    return (
        <>
            <p>
                {' '}
                The next step in creating the issuer is to create a smart contract that will act as the registry of
                credentials. In order to do this you need to connect the Concordium Wallet for Web. Please select the
                network onto which you wish to deploy the new registry contract.
            </p>
            <p>
                The registry contract will be created from the smart contract module{' '}
                <strong>{MODULE_REFERENCE_CREDENTIAL_REGISTRY}</strong>.
            </p>

            <br />
            <select name="write" id="write" onChange={changeDropDownHandler}>
                <option value="choose" disabled selected>
                    Choose
                </option>
                <option value="Testnet">Testnet</option>
                <option value="Mainnet">Mainnet</option>
            </select>
        </>
    );
}
