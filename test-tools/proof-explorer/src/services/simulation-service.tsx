import {
    AttributeKeyString,
    VerifiablePresentationRequestV1,
    AccountAddress,
    AccountTransactionType,
    RegisterDataPayload,
    DataBlob,
    CredentialStatementBuilder,
} from '@concordium/web-sdk';

import { BrowserWalletProvider, WalletConnectProvider, WalletProvider } from './wallet-connection';


export const handleSimulateAnchorCreation = async (provider: WalletProvider) => {

    const context = VerifiablePresentationRequestV1.createSimpleContext(
            Uint8Array.from([0, 1, 2, 3]),
            '0102'.repeat(16),
            'Wine payment'
        );
    const builder = new CredentialStatementBuilder();
    const statement = builder.forIdentityCredentials([0, 1, 2], (b) => b.revealAttribute(AttributeKeyString.firstName))
                            .getStatements();
    console.log("Statement data generated:", JSON.stringify(statement, null, 2));
    console.log("Generating anchor");
    const anchor = Uint8Array.from(VerifiablePresentationRequestV1.createAnchor(context, statement, {
            somePublicInfo: 'public info',
        }));   
    console.log("Anchor data generated:", anchor.toString());

    //Create RegisterData payload
    const registerData: RegisterDataPayload = { data: new DataBlob(anchor.buffer) };

    //send transaction
    console.log("sending transaction");
    if(provider instanceof BrowserWalletProvider) {
        try {            
            const a = await provider.getMostRecentlySelectedAccount();
            console.log("Most recently selected account:", a);

            const result = await provider.sendTransaction(
                AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"),  //this is my account currently on my wallet browser
                AccountTransactionType.RegisterData,
                registerData
            );
            console.log("Done sending transaction with result:", result);
            return result;
        } catch (err) {
            console.error("Error sending transaction:", err);
        }
    } else if (provider instanceof WalletConnectProvider) {
        console.log("Sending transaction via WalletConnectProvider.");
        try {
            const result = await provider.sendTransaction(
                    AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"),  //this gives back an empty frame, account currently on my wallet browser
                    //AccountAddress.fromBase58("3v1JUB1R1JLFtcKvHqD9QFqe2NXeBF53tp69FLPHYipTjNgLrV"), //this gives back whitelist error, I found this account on testnet ccdscan
                    AccountTransactionType.RegisterData,
                    registerData
                );
                console.log("Done sending transaction with result:", result);
            } catch (err) {
                console.error("Error sending transaction via WalletConnectProvider:", err);
            }
    }
     else {
        console.log("Provider is not a BrowserWalletProvider or WalletConnectProvider, cannot send transaction.");
    }
}


function bigIntReplacer(key: string, value: any) {    
  // Check if the current value is a BigInt
  if (typeof value === 'bigint') {
    console.log("bigint detected, key:", key, "value:", value);
    // Convert the BigInt to a string for JSON serialization
    return value.toString();
  }
  // For all other types (strings, numbers, objects, arrays), return the value as is
  return value;
}

function hexToDataBlob(hex: string): DataBlob {
    console.log("Converting hex to DataBlob:", hex);
    // Remove optional 0x prefix
    if (hex.startsWith("0x")) {
        hex = hex.slice(2);
    }

    // Create a Uint8Array from the hex string
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    // Wrap in DataBlob
    return new DataBlob(bytes.buffer);
}