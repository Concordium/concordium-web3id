import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    InitContractPayload,
    ModuleReference,
    UpdateContractPayload,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { SmartContractParameters } from '@concordium/browser-wallet-api-helpers';
import { CONTRACT_SUB_INDEX, CREDENTIAL_REGISTRY_BASE_64_SCHEMA } from './constants';

export async function createNewIssuer(
    connection: WalletConnection,
    account: string,
    issuerMetaData: string,
    schemas: string,
    revocationKeys: string
) {
    const parameter = {
        issuer_metadata: {
            hash: {
                None: [],
            },
            url: issuerMetaData,
        },
        storage_address: {
            index: 4791,
            subindex: 0,
        },
        schemas: JSON.parse(schemas),
        issuer: {
            None: [],
        },
        revocation_keys: JSON.parse(revocationKeys),
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
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

export async function issueCredential(
    connection: WalletConnection,
    account: string,
    input: string,
    credentialRegistryContratIndex: number
) {
    const schema = {
        parameters: JSON.parse(input),
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    return connection.signAndSendTransaction(
        account,
        AccountTransactionType.Update,
        {
            amount: new CcdAmount(BigInt(0)),
            address: {
                index: BigInt(credentialRegistryContratIndex),
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
