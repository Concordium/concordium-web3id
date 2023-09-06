/* eslint-disable no-console */
/* eslint-disable no-alert */
import React, { ChangeEvent, Dispatch, SetStateAction, useEffect } from 'react';

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
            <label className="field">
                Select Network:
                <br />
                <br />
                <select name="write" id="write" onChange={changeDropDownHandler}>
                    <option value="choose" disabled selected>
                        Choose
                    </option>
                    <option value="Testnet">Testnet</option>
                    <option value="Mainnet">Mainnet</option>
                </select>
            </label>
            <br />
        </>
    );
}
