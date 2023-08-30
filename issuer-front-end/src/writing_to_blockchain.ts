/* eslint-disable no-console */
import { createContext } from 'react';
import { AccountTransactionType, CcdAmount, InitContractPayload, ModuleReference, toBuffer } from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { SmartContractParameters } from '@concordium/browser-wallet-api-helpers';
import { CREDENTIAL_REGISTRY_BASE_64_SCHEMA, MODULE_REFERENCE_CREDENTIAL_REGISTRY } from './constants';

export async function createNewIssuer(
    connection: WalletConnection,
    account: string,
    issuerMetaData: string,
    issuerKey: string,
    credentialSchema: object,
    revocationKeys: string,
    credentialType: string
) {
    if (issuerKey === '') {
        throw new Error(`Create issuer verifyKey in step 1`);
    }

    if (issuerKey.length !== 64) {
        throw new Error(`issuerKey needs a length of 64`);
    }

    const parameter = {
        issuer_metadata: {
            hash: {
                None: [],
            },
            url: issuerMetaData,
        },
        credential_type: {
            credential_type: credentialType,
        },
        issuer_key: issuerKey,
        schema: credentialSchema,
        issuer_account: {
            Some: [account],
        },
        revocation_keys: JSON.parse(revocationKeys),
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: new CcdAmount(BigInt(0)),
        moduleRef: new ModuleReference(MODULE_REFERENCE_CREDENTIAL_REGISTRY),
        initName: 'credential_registry',
        param: toBuffer(''),
        maxContractExecutionEnergy: 30000n,
    } as InitContractPayload;

    console.debug('Sending init transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.InitContract, payload, schema);
}

/**
 * Global application state.
 */
export type State = {
    isConnected: boolean;
    account: string | undefined;
};

export const state = createContext<State>({ isConnected: false, account: undefined });
