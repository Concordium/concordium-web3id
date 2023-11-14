/* eslint-disable no-console */
/* eslint-disable no-alert */
import { Dispatch, SetStateAction } from 'react';
import { Form } from 'react-bootstrap';
import { MODULE_REFERENCE_CREDENTIAL_REGISTRY } from './constants';

interface ConnectionProps {
    isTestnet: boolean;
    setIsTestnet: Dispatch<SetStateAction<boolean>>;
}

export default function SelectNetwork(props: ConnectionProps) {
    const { isTestnet, setIsTestnet } = props;

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
            <Form>
                <Form.Check
                    type="switch"
                    id="testnet-check"
                    label="Testnet"
                    checked={isTestnet}
                    onClick={() => setIsTestnet(true)}
                />
                <Form.Check
                    type="switch"
                    id="mainnet-check"
                    label="Mainnet"
                    checked={!isTestnet}
                    onClick={() => setIsTestnet(false)}
                />
            </Form>
        </>
    );
}
