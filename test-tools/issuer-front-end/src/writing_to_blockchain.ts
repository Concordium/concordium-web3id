/* eslint-disable no-console */
import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    ContractAddress,
    ContractName,
    Energy,
    InitContractPayload,
    ModuleReference,
    Parameter,
    ReceiveName,
    UpdateContractPayload,
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
        amount: CcdAmount.zero(),
        moduleRef: ModuleReference.fromHexString(MODULE_REFERENCE_CREDENTIAL_REGISTRY),
        initName: ContractName.fromString('credential_registry'),
        param: Parameter.empty(),
        maxContractExecutionEnergy: Energy.create(30000n),
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

export async function updateCredentialSchema(
    connection: WalletConnection,
    account: string,
    credentialRegistryContractIndex: number | undefined,
    credentialSchema: string
) {
    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
    }

    const parameter = {
        schema_ref: {
            hash: {
                None: [],
            },
            url: credentialSchema,
        },
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.updateCredentialSchema'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
}

export async function updateCredentialMetadata(
    connection: WalletConnection,
    account: string,
    credentialRegistryContractIndex: number | undefined,
    credentialMetadata: string,
    credentialPublicKey: string
) {
    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
    }

    if (credentialPublicKey.length !== 64) {
        throw new Error(`credentialPublicKey needs a length of 64`);
    }

    const parameter = Array.from([
        {
            credential_id: credentialPublicKey,
            metadata_url: {
                hash: {
                    None: [],
                },
                url: credentialMetadata,
            },
        },
    ]) as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.updateCredentialMetadata'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
}

export async function updateIssuerMetadata(
    connection: WalletConnection,
    account: string,
    credentialRegistryContractIndex: number | undefined,
    issuerMetaData: string
) {
    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
    }

    const parameter = {
        hash: {
            None: [],
        },
        url: issuerMetaData,
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.updateIssuerMetadata'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
}

export async function revokeCredential(
    connection: WalletConnection,
    account: string,
    credentialPublicKey: string,
    credentialRegistryContractIndex: number | undefined,
    auxiliaryData: number[],
    reason: string
) {
    if (credentialPublicKey.length !== 64) {
        throw new Error(`credentialPublicKey needs a length of 64`);
    }

    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
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

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.revokeCredentialIssuer'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
}

export async function restoreCredential(
    connection: WalletConnection,
    account: string,
    credentialPublicKey: string,
    credentialRegistryContractIndex: number | undefined,
    reason: string
) {
    if (credentialPublicKey.length !== 64) {
        throw new Error(`credentialPublicKey needs a length of 64`);
    }

    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
    }

    const reasonOption = reason === '' ? { None: [] } : { Some: [{ reason }] };

    const parameter = {
        credential_id: credentialPublicKey,
        reason: reasonOption,
    } as unknown as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.restoreCredential'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
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
    credentialRegistryContractIndex: number | undefined,
    auxiliaryData: number[]
) {
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

    if (credentialRegistryContractIndex === undefined) {
        throw new Error(`Set credentialRegistryContractIndex`);
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

    const payload = {
        amount: CcdAmount.zero(),
        address: ContractAddress.create(credentialRegistryContractIndex, CONTRACT_SUB_INDEX),
        receiveName: ReceiveName.fromString('credential_registry.registerCredential'),
        maxContractExecutionEnergy: Energy.create(30000n),
    } as UpdateContractPayload;

    console.debug('Sending update transaction:');
    console.debug('Parameter:');
    console.debug(parameter);
    console.debug('Payload:');
    console.debug(payload);
    console.debug('Account:');
    console.debug(account);
    console.debug('');

    return connection.signAndSendTransaction(account, AccountTransactionType.Update, payload, schema);
}

/**
 * Global application state.
 */
export type State = {
    isConnected: boolean;
    account: string | undefined;
};

export const state = createContext<State>({ isConnected: false, account: undefined });
