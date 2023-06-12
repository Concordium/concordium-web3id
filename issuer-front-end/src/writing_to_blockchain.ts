import { createContext } from 'react';
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
import { SmartContractParameters } from '@concordium/browser-wallet-api-helpers';
import {
    CONTRACT_SUB_INDEX,
    CREDENTIAL_REGISTRY_BASE_64_SCHEMA,
    STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA,
} from './constants';

export async function createNewIssuer(
    connection: WalletConnection,
    account: string,
    issuerMetaData: string,
    schemas: string,
    revocationKeys: string
) {
    if (issuerMetaData === '') {
        throw new Error(`Set issuerMetaData`);
    }

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
    signatureInput: string,
    browserPublicKey: string,
    signature: string,
    validFromDate: string,
    validUntilDate: string,
    credentialMetaDataURL: string,
    credentialType: string,
    isHolderRevocable: boolean,
    credentialRegistryContratIndex: number
) {
    if (signature === '') {
        throw new Error(`Generate signature`);
    }

    if (validFromDate === '') {
        throw new Error(`Set validFromDate`);
    }

    if (validUntilDate === '') {
        throw new Error(`Set validUntilDate`);
    }

    if (credentialMetaDataURL === '') {
        throw new Error(`Set credentialMetaDataURL`);
    }

    if (credentialType === '') {
        throw new Error(`Set credentialType`);
    }

    if (credentialRegistryContratIndex === 0) {
        throw new Error(`Set credentialRegistryContratIndex`);
    }

    const storageInputParameter = {
        data: JSON.parse(signatureInput),
        public_key: browserPublicKey,
        signature,
    };

    const serializedMessage = serializeTypeValue(
        storageInputParameter,
        toBuffer(STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA, 'base64')
    );

    const validFromDateISOString = new Date(Date.parse(validFromDate)).toISOString();
    const validUntilDateISOString = new Date(Date.parse(validUntilDate)).toISOString();

    const parameter = {
        credential_info: {
            holder_id: browserPublicKey,
            holder_revocable: isHolderRevocable,
            commitment: [4, 2, 52, 3],
            valid_from: validFromDateISOString,
            valid_until: {
                Some: [validUntilDateISOString],
            },
            credential_type: {
                credential_type: credentialType,
            },
            metadata_url: {
                hash: {
                    None: [],
                },
                url: credentialMetaDataURL,
            },
        },
        auxiliary_data: Array.from(serializedMessage),
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
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
