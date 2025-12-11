import {
    VerificationRequestV1,
    RegisterDataPayload,
    DataBlob,
    IdentityProviderDID,
} from '@concordium/web-sdk';

import { BrowserWalletProvider, WalletProvider } from './wallet-connection';
import { TopLevelStatements } from '../types';
import { NETWORK } from '../constants';

// TODO: pass into the `handleSimulateAnchorCreation` function 
export enum ClaimsType {
    AccountOrIdentityClaims,
    OnlyAccountClaims,
    OnlyIdentityClaims
}

export const handleSimulateAnchorCreation = async (
    provider: WalletProvider,
    idCredStatement: TopLevelStatements,
    context:VerificationRequestV1.Context
) => {
    if (idCredStatement.length == 0) {
        console.error('Create the statement in the column on the left before submitting the anchor transaction.');
        throw new Error(
            'Create the statement in the column on the left before submitting the anchor transaction.'
        );
    }

    console.log('context data:', JSON.stringify(context, null, 2));

    const subjectClaims: VerificationRequestV1.SubjectClaims[] = [];

    idCredStatement.forEach((stmt, index) => {
        if (stmt.type == 'id') {
            // TODO: pass into the function
            let cred_type: VerificationRequestV1.IdentityCredType[] = ['identityCredential', 'accountCredential'];

            const identityProviderIndex: number[] = [];
            stmt.statement.idCred_idps.forEach(idp => {
                identityProviderIndex.push(idp.id);
            });

            let did: IdentityProviderDID[] = []
            identityProviderIndex.forEach(index => {
                did.push(new IdentityProviderDID(NETWORK, index));
            });

            const subject_claim: VerificationRequestV1.SubjectClaims = {
                type: 'identity',
                source: cred_type,
                // @ts-ignore
                statements: stmt.statement.statement,
                issuers: did,
            };

            subjectClaims.push(subject_claim);

        } else {
            console.error(`Unsupported statement type at index ${index}: ${stmt.type}.
               Only identity credential statements are supported for anchor creation simulation.`);
        }
    });

    const anchor = Uint8Array.from(
        VerificationRequestV1.createAnchor(context, subjectClaims, {
            // TODO: maybe add toggle for with/without public info
            somePublicInfo: 'public info',
        })
    );

    console.log('Anchor data generated:', anchor.toString());

    //Create RegisterData payload
    const registerData: RegisterDataPayload = { data: new DataBlob(anchor.buffer) };

    //send transaction
    console.log('sending transaction');

    try {
        if (provider instanceof BrowserWalletProvider) {
            return await provider.sendRegisterDataTransaction(registerData);
        } else {
            throw new Error(`Connect to the browser wallet to send the anchor transaction on-chain (simulates the merchant backend). 
                For the "prove" button below, meaning generating the identity proof, you can switch/connect the mobile wallet, IdApp or browser wallet.`);
        }
    } catch (err) {
        throw new Error(`Error sending transaction: ${(err as Error).message}`);
    }
};
