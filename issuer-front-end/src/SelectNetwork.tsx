/* eslint-disable no-console */
import React, { Dispatch, SetStateAction } from 'react';

interface ConnectionProps {
    setIsTestnet: Dispatch<SetStateAction<boolean | undefined>>;
}

export default function SelectNetwork(props: ConnectionProps) {
    const { setIsTestnet } = props;

    const changeDropDownHandler = () => {
        const e = document.getElementById('write') as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        if (value === 'Testnet') {
            setIsTestnet(true);
        } else if (value === 'Mainnet') {
            setIsTestnet(false);
        } else {
            console.error('Select a network');
            return;
        }

        const progressNext = document.getElementById('progress-next') as HTMLTextAreaElement;
        progressNext.disabled = false;
    };

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
