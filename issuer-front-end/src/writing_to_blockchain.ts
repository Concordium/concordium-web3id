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
        throw new Error(`Set issuerKey`);
    }

    if (credentialType === '') {
        throw new Error(`Set credentialType`);
    }

    if (schemaCredential === '') {
        throw new Error(`Set credentialSchemaURL`);
    }

    if (credentialType === '') {
        throw new Error(`Set credentialType`);
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

export async function issueCredential(
    connection: WalletConnection,
    account: string,
    browserPublicKey: string,
    validFromDate: string,
    validUntilDate: string,
    credentialMetaDataURL: string,
    isHolderRevocable: boolean,
    credentialRegistryContratIndex: number,
    auxiliaryData: number[]
) {
    if (validFromDate === '') {
        throw new Error(`Set validFromDate`);
    }

    if (validUntilDate === '') {
        throw new Error(`Set validUntilDate`);
    }

    if (credentialMetaDataURL === '') {
        throw new Error(`Set credentialMetaDataURL`);
    }

    if (credentialRegistryContratIndex === 0) {
        throw new Error(`Set credentialRegistryContratIndex`);
    }

    const validFromDateISOString = new Date(Date.parse(validFromDate)).toISOString();
    const validUntilDateISOString = new Date(Date.parse(validUntilDate)).toISOString();

    const parameter = {
        credential_info: {
            holder_id: browserPublicKey,
            holder_revocable: isHolderRevocable,
            valid_from: validFromDateISOString,
            valid_until: {
                Some: [validUntilDateISOString],
            },
            metadata_url: {
                hash: {
                    None: [],
                },
                url: credentialMetaDataURL,
            },
        },
        auxiliary_data: auxiliaryData,
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
