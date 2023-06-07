import { createContext } from 'react';
import { SmartContractParameters } from '@concordium/browser-wallet-api-helpers';
import {
    AccountTransactionType,
    CcdAmount,
    InitContractPayload,
    ModuleReference,
    UpdateContractPayload,
    serializeTypeValue,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import {
    CONTRACT_SUB_INDEX,
    CREDENTIAL_REGISTRY_BASE_64_SCHEMA,
    CREDENTIAL_REGISTRY_CONTRACT_INDEX,
    STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA,
    CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
} from './constants';

export async function createNewIssuer(connection: WalletConnection, account: string, input: string) {
    const schema = {
        parameters: JSON.parse(input),
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    return connection.signAndSendTransaction(
        account,
        AccountTransactionType.InitContract,
        {
            amount: new CcdAmount(BigInt(0)),
            moduleRef: new ModuleReference('d39cb3fa33561edc8c2d691a622a5cd0851ed38655ecdb82d67b8a12068259e8'),
            initName: 'credential_registry',
            param: toBuffer(''),
            maxContractExecutionEnergy: 30000n,
        } as InitContractPayload,
        schema
    );
}

export async function issueCredential(connection: WalletConnection, account: string, input: string, signature: string) {
    const storageInputParameter = {
        data: {
            contract_address: {
                index: CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
                subindex: 0,
            },
            encrypted_credential: [3, 35, 25],
            metadata: [34],
            timestamp: '2030-08-08T05:15:00Z',
        },
        public_key: '9cfb82e0b2c6a4c63e586e3f97796c14ddef1d431ae8cf73f5bed067f412cc90',
        signature,
    };

    const serializedMessage = serializeTypeValue(
        storageInputParameter,
        toBuffer(STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA, 'base64')
    );

    const inputParameter = {
        credential_info: {
            holder_id: '9cfb82e0b2c6a4c63e586e3f97796c14ddef1d431ae8cf73f5bed067f412cc90',
            holder_revocable: true,
            commitment: [4, 2, 52, 3],
            valid_from: '2030-08-08T05:15:00Z',
            valid_until: {
                Some: ['2030-08-08T05:15:00Z'],
            },
            credential_type: {
                credential_type: 'myType',
            },
            metadata_url: {
                hash: {
                    None: [],
                },
                url: 'https://credential/metaData/',
            },
        },
        auxiliary_data: Array.from(serializedMessage),
    } as SmartContractParameters;

    const schema = {
        parameters: inputParameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    return connection.signAndSendTransaction(
        account,
        AccountTransactionType.Update,
        {
            amount: new CcdAmount(BigInt(0)),
            address: {
                index: CREDENTIAL_REGISTRY_CONTRACT_INDEX,
                subindex: CONTRACT_SUB_INDEX,
            },
            receiveName: 'credential_registry.registerCredential',
            maxContractExecutionEnergy: 30000n,
        } as UpdateContractPayload,
        schema
    );
}

/**
 * Global application state.
 */
export type State = {
    isConnected: boolean;
    account: string | undefined;
};

export const state = createContext<State>({ isConnected: false, account: undefined });
