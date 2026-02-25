/* eslint-disable no-console */
import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    InitContractPayload,
    ModuleReference,
    ContractName,
    Parameter,
    Energy,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { TypedSmartContractParameters, moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { CREDENTIAL_REGISTRY_BASE_64_SCHEMA, MODULE_REFERENCE_CREDENTIAL_REGISTRY } from './constants';

export async function createNewIssuer(
    connection: WalletConnection,
    account: string,
    issuerMetaData: string | undefined,
    issuerKey: string | undefined,
    credentialSchema: string | undefined,
    revocationKeys: string,
    credentialType: string | undefined
) {
    if (issuerMetaData === undefined) {
        throw new Error(`Set issuerMetaData`);
    }

    if (credentialSchema === undefined) {
        throw new Error(`Set credentialSchema`);
    }

    if (credentialType === undefined) {
        throw new Error(`Set credentialType`);
    }

    if (issuerKey === undefined) {
        throw new Error(`Set issuerKey`);
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
        schema: {
            schema_ref: {
                hash: {
                    None: [],
                },
                url: credentialSchema,
            },
        },
        issuer_account: {
            Some: [account],
        },
        revocation_keys: JSON.parse(revocationKeys),
    } as TypedSmartContractParameters['parameters'];

    const schema: TypedSmartContractParameters = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    const payload = {
        amount: CcdAmount.fromMicroCcd(BigInt(0)),
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

/**
 * Global application state.
 */
export type State = {
    isConnected: boolean;
    account: string | undefined;
};

export const state = createContext<State>({ isConnected: false, account: undefined });
