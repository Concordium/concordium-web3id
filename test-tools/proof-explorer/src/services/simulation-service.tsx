import {
    VerificationRequestV1,
    AccountAddress,
    AccountTransactionType,
    RegisterDataPayload,
    DataBlob,
    IdentityProviderDID,
    Network,
} from '@concordium/web-sdk';

import { BrowserWalletProvider, WalletConnectProvider, WalletProvider } from './wallet-connection';
import { TopLevelStatements } from '../types';

// TODO: pass into the `handleSimulateAnchorCreation` function 
export enum ClaimsType {
    AccountOrIdentityClaims,
    OnlyAccountClaims,
    OnlyIdentityClaims
}

export const handleSimulateAnchorCreation = async (
    provider: WalletProvider,
    idCredStatement: TopLevelStatements
) => {
    if (idCredStatement.length == 0) {
        console.error('Create the statement in the column on the left before submitting the anchor transaction.');
        throw new Error(
            'Create the statement in the column on the left before submitting the anchor transaction.'
        );
    }


    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const context = VerificationRequestV1.createSimpleContext(nonce, 'Example Connection ID', 'Example Context String');

    console.log('context data generated:', JSON.stringify(context, null, 2));

    const subjectClaims: VerificationRequestV1.SubjectClaims[] = [];

    idCredStatement.forEach((stmt, index) => {
        if (stmt.type == 'id') {
            // TODO: pass into the function
            const network: Network = 'Testnet';
            const identityProviderIndex = 0;
            let did: IdentityProviderDID[] = [new IdentityProviderDID(network, identityProviderIndex)]
            let cred_type: VerificationRequestV1.IdentityCredType[] = ['identityCredential', 'accountCredential'];

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
    if (provider instanceof BrowserWalletProvider) {
        try {
            const a = await provider.getMostRecentlySelectedAccount();

            if (a === undefined || a === null) {
                console.error('No account selected in wallet.');
                return;
            }

            console.log('Most recently selected account:', a);

            const result = await provider.sendTransaction(
                AccountAddress.fromBase58(a),
                AccountTransactionType.RegisterData,
                registerData
            );
            console.log('Done sending transaction with result:', result);
            return result;
        } catch (err) {
            console.error('Error sending transaction:', err);
        }
    } else if (provider instanceof WalletConnectProvider) {
        console.log('This is NOT fully implemented yet ----> Sending transaction via WalletConnectProvider.');
        try {
            const result = await provider.sendTransaction(
                AccountAddress.fromBase58('3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ'), //this gives back an empty frame, account currently on my wallet browser
                //AccountAddress.fromBase58("3v1JUB1R1JLFtcKvHqD9QFqe2NXeBF53tp69FLPHYipTjNgLrV"), //this gives back whitelist error, I found this account on testnet ccdscan
                AccountTransactionType.RegisterData,
                registerData
            );
            console.log('Done sending transaction with result:', result);
        } catch (err) {
            console.error('Error sending transaction via WalletConnectProvider:', err);
        }
    } else {
        console.log('Provider is not a BrowserWalletProvider or WalletConnectProvider, cannot send transaction.');
    }
};
