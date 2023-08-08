import { toBuffer, JsonRpcClient, deserializeTypeValue, serializeTypeValue } from '@concordium/web-sdk';

import {
    CONTRACT_SUB_INDEX,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_PARAMETER_SCHEMA,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA,
    CONTRACT_REGISTRY_NAME,
} from './constants';

export async function getCredentialEntry(
    rpcClient: JsonRpcClient,
    publicKey: string,
    credentialRegistryContratIndex: number
) {
    if (publicKey.length !== 64) {
        throw new Error(`PublicKey needs a length of 64`);
    }

    if (credentialRegistryContratIndex === 0) {
        throw new Error(`Set credentialRegistryContratIndex`);
    }

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
        contract: { index: BigInt(credentialRegistryContratIndex), subindex: CONTRACT_SUB_INDEX },
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${CONTRACT_REGISTRY_NAME}.credentialEntry' of contract ' ${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    }

    const state = deserializeTypeValue(
        toBuffer(res.returnValue, 'hex'),
        toBuffer(REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA, 'base64')
    );

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${CONTRACT_REGISTRY_NAME}.credentialEntry' method of contract '${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    } else {
        return JSON.stringify(state);
    }
}

export async function accountInfo(rpcClient: JsonRpcClient, account: string) {
    return rpcClient.getAccountInfo(account);
}
