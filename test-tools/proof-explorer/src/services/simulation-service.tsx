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

export const handleSimulateAnchorCreation = async (
    provider: WalletProvider,
    currentStatementType: string | undefined,
    idCredStatement: TopLevelStatements
) => {
    console.log('Starting anchor creation simulation...', currentStatementType, idCredStatement);

    if (currentStatementType == undefined) {
        console.error('Create the statement in the column on the left first before submitting the anchor transaction.');
        throw new Error(
            'Create the statement in the column on the left first before submitting the anchor transaction.'
        );
    }

    if (currentStatementType != 'id') {
        console.error('Currently only identity credential statements are supported for anchor creation simulation.');
        throw new Error('Currently only identity credential statements are supported for anchor creation simulation.');
    }

    const nonce = crypto.getRandomValues(new Uint8Array(32));

    const context = VerificationRequestV1.createSimpleContext(nonce, 'Example Connection ID', 'Example Context String');

    console.log('context data generated:', JSON.stringify(context, null, 2));
    //TODO: need to build statements based on user input

    const providerIds: number[] = [];
    idCredStatement.forEach((stmt, index) => {
        if (stmt.type == 'id') {
            stmt.statement.idCred_idps.forEach((idp, idpIndex) => {
                console.log(`Issuer ${idpIndex}: id=${idp.id}, name=${idp.name}`);
                providerIds.push(idp.id);
            });

            stmt.statement.statement.forEach((attr, attrIndex) => {
                console.log(`Attribute ${attrIndex}: key=${attr.type}, value=${attr.attributeTag}`);
            });
        } else {
            console.error(`Unsupported statement type at index ${index}: ${stmt.type}`);
        }
    });

    // TODO pass in from function
    const network: Network = 'Testnet';
    const identityProviderIndex = 0;

    const requestClaims = VerificationRequestV1.claimsBuilder()
        .addAccountOrIdentityClaims(
            [
                // TODO: pass in real claim
                new IdentityProviderDID(network, identityProviderIndex),
            ],
            (b) => {
                b.addEUResidency();
                b.addMinimumAge(18);
                b.revealAttribute('firstName');
            }
        )
        .getClaims();

    console.log('Claims data generated:', JSON.stringify(requestClaims, null, 2));
    console.log('Generating anchor');

    const anchor = Uint8Array.from(
        VerificationRequestV1.createAnchor(context, requestClaims, {
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
