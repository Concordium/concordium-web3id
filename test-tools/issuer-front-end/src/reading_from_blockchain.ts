import {
    toBuffer,
    deserializeTypeValue,
    serializeTypeValue,
    ConcordiumGRPCClient,
    ReceiveName,
    ContractAddress,
} from '@concordium/web-sdk';
import { stringify } from 'json-bigint';

import {
    CONTRACT_SUB_INDEX,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_PARAMETER_SCHEMA,
    REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA,
    CONTRACT_REGISTRY_NAME,
    REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA,
} from './constants';

export async function registryMetadata(
    grpcClient: ConcordiumGRPCClient | undefined,
    credentialRegistryContratIndex: number | undefined
) {
    if (credentialRegistryContratIndex === undefined) {
        throw new Error(`Set Smart Contract Index in Step 3`);
    }

    const res = await grpcClient?.invokeContract({
        method: ReceiveName.fromString(`${CONTRACT_REGISTRY_NAME}.registryMetadata`),
        contract: ContractAddress.create(credentialRegistryContratIndex, CONTRACT_SUB_INDEX),
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${CONTRACT_REGISTRY_NAME}.registryMetadata' of contract ' ${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    }

    const state = deserializeTypeValue(
        res.returnValue.buffer,
        toBuffer(REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA, 'base64')
    );

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${CONTRACT_REGISTRY_NAME}.registryMetadata' method of contract '${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    } else {
        return JSON.stringify(state);
    }
}

export async function getCredentialEntry(
    grpcClient: ConcordiumGRPCClient | undefined,
    publicKey: string,
    credentialRegistryContratIndex: number | undefined
) {
    if (publicKey.length !== 64) {
        throw new Error(`PublicKey needs a length of 64`);
    }

    if (credentialRegistryContratIndex === undefined) {
        throw new Error(`Set Smart Contract Index in Step 3`);
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

    const res = await grpcClient?.invokeContract({
        method: ReceiveName.fromString(`${CONTRACT_REGISTRY_NAME}.credentialEntry`),
        parameter: serializedPublicKey,
        contract: ContractAddress.create(credentialRegistryContratIndex, CONTRACT_SUB_INDEX),
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${CONTRACT_REGISTRY_NAME}.credentialEntry' of contract ' ${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    }

    const state = deserializeTypeValue(
        res.returnValue.buffer,
        toBuffer(REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA, 'base64')
    );

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${CONTRACT_REGISTRY_NAME}.credentialEntry' method of contract '${BigInt(
                credentialRegistryContratIndex
            )} ' failed`
        );
    } else {
        return stringify(state);
    }
}
