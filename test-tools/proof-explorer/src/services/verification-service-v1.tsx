import { VerificationRequestV1, IdentityProviderDID, VerifiablePresentationV1, TransactionHash } from '@concordium/web-sdk';
import { NETWORK } from '../constants';
import { WalletConnectProvider, WalletProvider } from './wallet-connection';
import { useState } from 'react';
import { TopLevelStatements } from '../types';
import ProofDetails from '../components/ProofDetails';

async function submitProof(
    subjectClaims: VerificationRequestV1.SubjectClaims[],
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined,
    provider: WalletProvider,
    setMessages: (updateMessage: (oldMessages: string[]) => string[]) => void,
    setProofData?: (proof: string) => void  // optional param to store proof data
) {

    if (anchorTransactionHash == undefined) {
        console.error(`Submit an anchor transaction first.`);
        throw new Error(`Submit an anchor transaction first.`)
    }

    let verification_request = VerificationRequestV1.create(context, subjectClaims, anchorTransactionHash);

    console.log('Starting submitProof');
    let proof: VerifiablePresentationV1.Type;


    try {
        if (provider instanceof WalletConnectProvider) {
            console.log("Requesting verifiable presentation V1 from wallet...");

            proof = await provider.requestVerifiablePresentationV1(verification_request);
            console.log(proof.toString());
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

    // TODO: check proof
    const is_proof_valid = true;

    if (is_proof_valid) {
        setMessages((oldMessages) => [...oldMessages, 'Proof OK']);
        if (setProofData) {
            setProofData(proof.toString());
        }
    } else {
        // const body = await resp.json();
        // setMessages((oldMessages) => [...oldMessages, `Proof not OK: (${resp.status}) ${body}`]);

        setMessages((oldMessages) => [...oldMessages, `Proof not OK`]);
    }
}

export function SubmitProofV1(
    idCredStatement: TopLevelStatements,
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined,
    provider: WalletProvider | undefined,
): [(messages: string[]) => any, React.JSX.Element] {
    const [messages, setMessages] = useState<string[]>([]);
    const [currentProof, setCurrentProof] = useState<string | null>(null);
    const [isProofDetailsOpen, setIsProofDetailsOpen] = useState<boolean>(false);

    const subjectClaims: VerificationRequestV1.IdentityClaims[] = [];

    idCredStatement.forEach((stmt, index) => {
        if (stmt.type == 'id') {
            // TODO: to be handed in via function
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
                   Only identity credential statements are supported for proving in this flow.`);
        }
    });

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
                            () => submitProof(subjectClaims, context, anchorTransactionHash, provider, setMessages, setCurrentProof)
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
            <ProofDetails
                proof={currentProof}
                isOpen={isProofDetailsOpen}
                onClose={handleCloseDetails}
            />
        </div>,
    ];
}