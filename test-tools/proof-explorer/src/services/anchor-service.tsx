import {
    VerificationRequestV1,
    RegisterDataPayload,
    DataBlob,
} from '@concordium/web-sdk';

import { BrowserWalletProvider, WalletProvider } from './wallet-connection';
import { SubjectClaimsType, TopLevelStatements } from '../types';
import { getSubjectClaims } from '../components/ProofExplorer';

export const createAnchorAndSubmitService = async (
    provider: WalletProvider,
    statements: TopLevelStatements,
    claimsType: SubjectClaimsType,
    context: VerificationRequestV1.Context,
    withPublicInfo: boolean,
) => {
    if (statements.length == 0) {
        console.error('Create the statement in the column on the left before submitting the anchor transaction.');
        throw new Error(
            'Create the statement in the column on the left before submitting the anchor transaction.'
        );
    }

    const subjectClaims = getSubjectClaims(statements, claimsType);

    console.log('context data:', JSON.stringify(context, null, 2));

    const anchor = withPublicInfo
        ? (console.log('Generating anchor with public info'),
            VerificationRequestV1.createAnchor(
                context,
                subjectClaims,
                { somePublicInfo: 'public info' }
            ))
        : (console.log('Generating anchor without public info'),
            VerificationRequestV1.createAnchor(context, subjectClaims));

    const registerData: RegisterDataPayload = { data: new DataBlob(Uint8Array.from(anchor).buffer) };

    console.log('Sending anchor transaction');

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
