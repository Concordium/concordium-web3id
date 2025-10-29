import {
    AttributeKeyString,
    VerifiablePresentationRequestV1,
    AccountAddress,
    AccountTransactionType,
    RegisterDataPayload,
    DataBlob,
    AccountTransactionHeader,
    AccountTransaction,
    TransactionExpiry,
    CredentialStatementBuilder,
    SequenceNumber,
    CcdAmount,
} from '@concordium/web-sdk';

import { BrowserWalletProvider, WalletProvider } from './wallet-connection';

import { Buffer } from 'buffer';

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
    const hexAnchor = Buffer.from(anchor).toString('hex');
    console.log("Anchor data (hex):", hexAnchor);
    /*
    a46468617368582040fec7e9e2a38820954a14d7da1d764d7a9293dfd3a5deb7525fdfcd72d99e10647479706566434344565241667075626c6963a16e736f6d655075626c6963496e666f6b7075626c696320696e666f6776657273696f6e01
    */
        /*
        164,100,104,97,115,104,88,32,64,254,199,233,226,163,136,32,149,74,20,215,218,29,118,77,122,146,147,223,211,165,222,183,82,95,223,205,114,217,158,16,100,116,121,112,101,102,67,67,68,86,82,65,102,112,117,98,108,105,99,161,110,115,111,109,101,80,117,98,108,105,99,73,110,102,111,107,112,117,98,108,105,99,32,105,110,102,111,103,118,101,114,115,105,111,110,11
        */
    //const anchor = Buffer.from('this is some rubbish test no meaning', 'utf8');
    /*const bytes = [164,100,104,97,115,104,88,32,64,254,199,233,226,163,136,32,149,74,20,215,218,29,118,77,122,146,147,223,211,165,222,183,82,95,223,205,114,217,158,16,100,116,121,112,101,102,67,67,68,86,82,65,102,112,117,98,108,105,99,161,110,115,111,109,101,80,117,98,108,105,99,73,110,102,111,107,112,117,98,108,105,99,32,105,110,102,111,103,118,101,114,115,105,111,110,11];
    const hexBytes = Buffer.from(bytes).toString('hex');
    console.log("Anchor data (hex from bytes):", hexBytes);
    */
   //const anchor = Buffer.from('BLA BLA BLA TEST ANCHOR DATA', 'utf8');
    //const anchor = Uint8Array.from([164,100,104,97,115,104,88,32,64,254,199,233,226,163,136,32,149,74,20,215,218,29,118,77,122,146,147,223,211,165,222,183,82,95,223,205,114,217,158,16,100,116,121,112,101,102,67,67,68,86,82,65,102,112,117,98,108,105,99,161,110,115,111,109,101,80,117,98,108,105,99,73,110,102,111,107,112,117,98,108,105,99,32,105,110,102,111,103,118,101,114,115,105,111,110,11]);
    console.log("Anchor data generated:", anchor.toString());

    //Create RegisterData transaction
    const header: AccountTransactionHeader = {
        expiry: TransactionExpiry.futureMinutes(60),
        nonce: SequenceNumber.create(1),
        //sender: AccountAddress.fromBase58("4ZJBYQbVp3zVZyjCXfZAAYBVkJMyVj8UKUNj9ox5YqTCBdBq2M"),
        sender: AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"),
    };
    console.log("Transaction header data:", JSON.stringify(header, bigIntReplacer, 2));
    console.log('anchor bytelength', anchor.byteLength);
    console.log([...anchor].slice(0, 16));

    const registerData: RegisterDataPayload = { data: new DataBlob(anchor.buffer) };
    const registerDataAccountTransaction: AccountTransaction = {
        header: header,
        payload: registerData,
        type: AccountTransactionType.RegisterData,
    };
    console.log("RegisterData transaction data:", JSON.stringify(registerDataAccountTransaction, bigIntReplacer, 2));


    //send transaction
    console.log("sending transaction");
    if(provider instanceof BrowserWalletProvider) {
        try {            
            const a = await provider.getMostRecentlySelectedAccount();
            console.log("Most recently selected account:", a);

            const result = await provider.sendTransaction(
                AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"),  //this gives back an empty frame, account currently on my wallet browser
                //AccountAddress.fromBase58("3v1JUB1R1JLFtcKvHqD9QFqe2NXeBF53tp69FLPHYipTjNgLrV"), //this gives back whitelist error, I found this account on testnet ccdscan
                AccountTransactionType.RegisterData,
                registerData
            );
            console.log("Done sending transaction with result:", result);
        } catch (err) {
            console.error("Error sending transaction:", err);
        }
    } else {
        console.log("Provider is not a BrowserWalletProvider, cannot send transaction.");
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