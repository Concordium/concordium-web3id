import { VerificationRequestV1, VerifiablePresentationV1, TransactionHash, VerificationAuditRecordV1 } from '@concordium/web-sdk';
import { NETWORK } from '../constants';
import { WalletConnectProvider, WalletProvider } from './wallet-connection';
import { useState } from 'react';
import ProofDetails from '../components/ProofDetails';
import { ConcordiumGRPCClient } from '@concordium/web-sdk';
import { ProofType } from '../types';

async function submitProof(
    provider: WalletProvider,
    client: ConcordiumGRPCClient,
    subjectClaims: VerificationRequestV1.SubjectClaims[],
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined,
    setMessages: (updateMessage: (oldMessages: string[]) => string[]) => void,
    setProofData?: (proof: VerifiablePresentationV1.Type) => void, // optional param to store proof data
) {
    if (subjectClaims.length == 0) {
        console.error('Create the statement in the column on the left and submit the anchor transaction first.');
        throw new Error(
            'Create the statement in the column on the left and submit the anchor transaction first.'
        );
    }

    if (anchorTransactionHash == undefined) {
        console.error(`Submit an anchor transaction first.`);
        throw new Error(`Submit an anchor transaction first.`)
    }

    let verification_request = VerificationRequestV1.create(context, subjectClaims, anchorTransactionHash);

    let proof: VerifiablePresentationV1.Type;

    try {
        if (provider instanceof WalletConnectProvider) {
            proof = await provider.requestVerifiablePresentationV1(verification_request);
            console.log(JSON.stringify(proof));
            console.log(proof);
        } else {
            throw new Error(`Verifiable presentation V1 flow is not implemented for the browser wallet yet.`);
        }
    } catch (err) {
        if (err instanceof Error) {
            setMessages((oldMessages) => [...oldMessages, `Could not get proof: ${err.message}`]);
        } else {
            console.log(err);
        }
        return;
    }

    const audit_record_id = "12345";
    let verification_result = await VerificationAuditRecordV1.createChecked(audit_record_id, verification_request, proof, client, NETWORK)

    if (verification_result.type == `success`) {
        setMessages((oldMessages) => [...oldMessages, 'Proof OK']);
        if (setProofData) {
            setProofData(proof);
        }
    } else {
        // const body = await resp.json();
        // setMessages((oldMessages) => [...oldMessages, `Proof not OK: (${resp.status}) ${body}`]);

        setMessages((oldMessages) => [...oldMessages, `Proof not OK`]);
    }
}

export function SubmitProofV1(
    provider: WalletProvider | undefined,
    client: ConcordiumGRPCClient,
    subjectClaims: VerificationRequestV1.IdentityClaims[],
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined,
): [(messages: string[]) => any, React.JSX.Element] {
    const [messages, setMessages] = useState<string[]>([]);
    const [currentProof, setCurrentProof] = useState<VerifiablePresentationV1.Type | null>(null);
    const [isProofDetailsOpen, setIsProofDetailsOpen] = useState<boolean>(false);

    const handleViewDetails = () => {
        if (currentProof) {
            setIsProofDetailsOpen(true);
        }
    };

    const handleCloseDetails = () => {
        setIsProofDetailsOpen(false);
    };

    return [
        setMessages,
        <div>
            <div>
                {provider !== undefined && (
                    <button
                        title="Submit the statement as a verified presentation request to the wallet."
                        onClick={
                            () => submitProof(provider, client, subjectClaims, context, anchorTransactionHash, setMessages, setCurrentProof)
                        }
                        type="button"
                        className="col-sm-4 btn btn-primary"
                    >
                        {'Prove'}
                    </button>
                )}
            </div>
            <hr />
            <div>
                <ol>
                    {messages.map((m, index) => {
                        if (m === 'Proof OK' && currentProof) {
                            return (
                                <li key={index} className="alert alert-success d-flex justify-content-between align-items-center">
                                    <span>{m}</span>
                                    <button
                                        onClick={handleViewDetails}
                                        className="btn btn-sm btn-outline-success"
                                    >
                                        View Details
                                    </button>
                                </li>
                            );
                        }
                        return <li key={index} className="alert alert-success">{m}</li>;
                    })}
                </ol>
            </div>
            {/* Render the ProofDetails popup */}
            {currentProof && (
                <ProofDetails
                    proof={{
                        type: ProofType.VerifiablePresentationV1,
                        value: currentProof,
                    }}
                    isOpen={isProofDetailsOpen}
                    onClose={handleCloseDetails}
                />
            )}
        </div>,
    ];
}