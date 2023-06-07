import { toBuffer, JsonRpcClient, deserializeTypeValue, serializeTypeValue } from '@concordium/web-sdk';

import {
    CONTRACT_SUB_INDEX,
    CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
    STORAGE_CONTRACT_VIEW_RETURN_VALUE_SCHEMA,
    STORAGE_CONTRACT_VIEW_PARAMETER_SCHEMA,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_PARAMETER_SCHEMA,
    CREDENTIAL_REGISTRY_CONTRACT_INDEX,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA,
    CONTRACT_REGISTRY_NAME,
    CONTRACT_STORAGE_NAME,
} from './constants';

export async function getStorageValue(rpcClient: JsonRpcClient, publicKey: string) {
    let serializedPublicKey;

    try {
        serializedPublicKey = serializeTypeValue(publicKey, toBuffer(STORAGE_CONTRACT_VIEW_PARAMETER_SCHEMA, 'base64'));
    } catch (err) {
        throw new Error((err as Error).message);
    }

    const res = await rpcClient.invokeContract({
        method: `${CONTRACT_STORAGE_NAME}.view`,
        parameter: serializedPublicKey,
        contract: { index: CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX, subindex: CONTRACT_SUB_INDEX },
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${CONTRACT_STORAGE_NAME}.view' of contract '${CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX}' failed`
        );
    }

    const state = deserializeTypeValue(
        toBuffer(res.returnValue, 'hex'),
        toBuffer(STORAGE_CONTRACT_VIEW_RETURN_VALUE_SCHEMA, 'base64')
    );

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${CONTRACT_STORAGE_NAME}.view' method of contract '${CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX}' failed`
        );
    } else {
        return JSON.stringify(state);
    }
}

export async function getCredentialEntry(rpcClient: JsonRpcClient, publicKey: string) {
    let serializedPublicKey;

    try {
        serializedPublicKey = serializeTypeValue(
            publicKey,
            toBuffer(REGISTRY_CONTRACT_CREDENTIAL_ENTRY_PARAMETER_SCHEMA, 'base64')
        );
    } catch (err) {
        throw new Error((err as Error).message);
    }

    const res = await rpcClient.invokeContract({
        method: `${CONTRACT_REGISTRY_NAME}.credentialEntry`,
        parameter: serializedPublicKey,
        contract: { index: CREDENTIAL_REGISTRY_CONTRACT_INDEX, subindex: CONTRACT_SUB_INDEX },
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${CONTRACT_REGISTRY_NAME}.credentialEntry' of contract '${CREDENTIAL_REGISTRY_CONTRACT_INDEX}' failed`
        );
    }

    const state = deserializeTypeValue(
        toBuffer(res.returnValue, 'hex'),
        toBuffer(REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA, 'base64')
    );

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${CONTRACT_REGISTRY_NAME}.credentialEntry' method of contract '${CREDENTIAL_REGISTRY_CONTRACT_INDEX}' failed`
        );
    } else {
        return JSON.stringify(state);
    }
}

export async function accountInfo(rpcClient: JsonRpcClient, account: string) {
    return rpcClient.getAccountInfo(account);
}
