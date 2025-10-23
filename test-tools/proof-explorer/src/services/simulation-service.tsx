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
} from '@concordium/web-sdk';



export const handleSimulateAnchorCreation = () => {

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
    const anchor = VerifiablePresentationRequestV1.createAnchor(context, statement, {
            somePublicInfo: 'public info',
        });                                    
    console.log("Anchor data generated:", anchor.toString());

    //Create RegisterData transaction
    const header: AccountTransactionHeader = {
        expiry: TransactionExpiry.futureMinutes(60),
        nonce: SequenceNumber.create(1),
        sender: AccountAddress.fromBase58("4ZJBYQbVp3zVZyjCXfZAAYBVkJMyVj8UKUNj9ox5YqTCBdBq2M"),
    };
    console.log("Transaction header data:", JSON.stringify(header, null, 2));
    const copiedData = new Uint8Array(anchor);
    const registerData: RegisterDataPayload = { data: new DataBlob(copiedData.buffer) };
    const registerDataAccountTransaction: AccountTransaction = {
        header: header,
        payload: registerData,
        type: AccountTransactionType.RegisterData,
    };
    console.log("RegisterData transaction data:", JSON.stringify(registerDataAccountTransaction, null, 2));

}