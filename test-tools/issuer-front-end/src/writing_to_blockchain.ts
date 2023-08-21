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
import {
    CONTRACT_SUB_INDEX,
    CREDENTIAL_REGISTRY_BASE_64_SCHEMA,
    MODULE_REFERENCE_CREDENTIAL_REGISTRY,
} from './constants';

export async function createNewIssuer(
    connection: WalletConnection,
    account: string,
    issuerMetaData: string,
    issuerKey: string,
    schemaCredential: string,
    revocationKeys: string,
    credentialType: string
) {
    if (issuerMetaData === '') {
        throw new Error(`Set issuerMetaData`);
    }

    if (issuerKey === '') {
        throw new Error(`Create issuer verifyKey in step 1`);
    }

    if (credentialType === '') {
        throw new Error(`Set credentialType`);
    }

    if (schemaCredential === '') {
        throw new Error(`Set credentialSchemaURL`);
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
        schema: JSON.parse(schemaCredential),
        issuer_account: {
            Some: [account],
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
            moduleRef: new ModuleReference(MODULE_REFERENCE_CREDENTIAL_REGISTRY),
            initName: 'credential_registry',
            param: toBuffer(''),
            maxContractExecutionEnergy: 30000n,
        } as InitContractPayload,
        schema
    );
}

export async function revokeCredential(
    connection: WalletConnection,
    account: string,
    credentialPublicKey: string,
    credentialRegistryContratIndex: number,
    auxiliaryData: number[],
    reason: string
) {
    if (credentialPublicKey === '') {
        throw new Error(`Set credentialPublicKey`);
    }

    if (credentialPublicKey.length !== 64) {
        throw new Error(`credentialPublicKey needs a length of 64`);
    }

    if (credentialRegistryContratIndex === 0) {
        throw new Error(`Set credentialRegistryContratIndex`);
    }

    const reasonOption = reason === '' ? { None: [] } : { Some: [{ reason }] };

    const parameter = {
        credential_id: credentialPublicKey,
        reason: reasonOption,
        auxiliary_data: auxiliaryData,
    } as unknown as SmartContractParameters;

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
            receiveName: 'credential_registry.revokeCredentialIssuer',
            maxContractExecutionEnergy: 30000n,
        } as UpdateContractPayload,
        schema
    );
}

export async function issueCredential(
    connection: WalletConnection,
    account: string,
    credentialPublicKey: string,
    credentialHasExpiryDate: boolean,
    validFromDate: string,
    validUntilDate: string,
    credentialMetaDataURL: string,
    isHolderRevocable: boolean,
    credentialRegistryContratIndex: number,
    auxiliaryData: number[]
) {
    if (credentialPublicKey === '') {
        throw new Error(`Set credentialPublicKey`);
    }

    if (credentialPublicKey.length !== 64) {
        throw new Error(`credentialPublicKey needs a length of 64`);
    }

    if (validFromDate === '') {
        throw new Error(`Set validFromDate`);
    }

    const validFromDateISOString = new Date(Date.parse(validFromDate)).toISOString();
    let validUntilDateISOString;

    if (credentialHasExpiryDate) {
        if (validUntilDate === '') {
            throw new Error(`Set validUntilDate`);
        } else {
            validUntilDateISOString = new Date(Date.parse(validUntilDate)).toISOString();
        }
    }

    if (credentialMetaDataURL === '') {
        throw new Error(`Set credentialMetaDataURL`);
    }

    if (credentialRegistryContratIndex === 0) {
        throw new Error(`Set credentialRegistryContratIndex`);
    }

    const validUntil = credentialHasExpiryDate ? { Some: [validUntilDateISOString] } : { None: [] };

    const parameter = {
        credential_info: {
            holder_id: credentialPublicKey,
            holder_revocable: isHolderRevocable,
            valid_from: validFromDateISOString,
            valid_until: validUntil,
            metadata_url: {
                hash: {
                    None: [],
                },
                url: credentialMetaDataURL,
            },
        },
        auxiliary_data: auxiliaryData,
    } as unknown as SmartContractParameters;

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
