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
/*    const anchor = VerifiablePresentationRequestV1.createAnchor(context, statement, {
            somePublicInfo: 'public info',
        });                                    */
    const anchor = Buffer.from('test', 'utf8');
    console.log("Anchor data generated:", anchor.toString());

    //Create RegisterData transaction
    const header: AccountTransactionHeader = {
        expiry: TransactionExpiry.futureMinutes(60),
        nonce: SequenceNumber.create(1),
        //sender: AccountAddress.fromBase58("4ZJBYQbVp3zVZyjCXfZAAYBVkJMyVj8UKUNj9ox5YqTCBdBq2M"),
        sender: AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"),
    };
    console.log("Transaction header data:", JSON.stringify(header, bigIntReplacer, 2));
    const copiedData = new Uint8Array(anchor);
    const registerData: RegisterDataPayload = { data: new DataBlob(copiedData.buffer) };
    const registerDataAccountTransaction: AccountTransaction = {
        header: header,
        payload: registerData,
        type: AccountTransactionType.RegisterData,
    };
    console.log("RegisterData transaction data:", JSON.stringify(registerDataAccountTransaction, bigIntReplacer, 2));

    // sign message
    /*console.log("going to sign message");
    if(provider instanceof BrowserWalletProvider) {
        const signed = provider.signMessage(AccountAddress.fromBase58("3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ"), "bla");
        console.log("signed message:", signed);
    } else {
        console.log("Provider is not a BrowserWalletProvider, cannot sign message.");
    }*/

    //send transaction
    console.log("sending transaction");
    if(provider instanceof BrowserWalletProvider) {
        try {            
            const a = await provider.getMostRecentlySelectedAccount();
            console.log("Most recently selected account:", a);
/*
            const transfer = await provider.sendTransferTransaction(
                AccountAddress.fromBase58('3v1JUB1R1JLFtcKvHqD9QFqe2NXeBF53tp69FLPHYipTjNgLrV'),
                AccountTransactionType.Transfer,
                {
                    amount: CcdAmount.fromCcd(BigInt(1000000)),
                    to: AccountAddress.fromBase58('3kJgxPSCuoUBtWp46GjSEbMEE6AymNwSxWhXnAwETmLJCr1fZQ'),
                }
            );
            console.log("Done sending transfer with result:", transfer);
*/
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