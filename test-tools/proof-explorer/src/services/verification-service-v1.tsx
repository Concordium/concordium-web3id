import { useState } from 'react';

import {
    ConcordiumGRPCClient,
    VerificationRequestV1,
    VerifiablePresentationV1,
    TransactionHash,
    VerificationAuditRecordV1,
} from '@concordium/web-sdk';

import { CONCORDIUM_TESTNET_VERIFIER_V1, NETWORK } from '../constants';
import { WalletProvider } from './wallet-connection';
import { ProofType, SubjectClaimsType, TopLevelStatements } from '../types';
import ProofDetails from '../components/ProofDetails';
import { getSubjectClaims } from '../components/ProofExplorer';

// This allows the backend URL to come from three sources, in order of priority:
// 1️⃣ Runtime value injected by Nginx / Docker via the `env.js` file.
// 2️⃣ Build-time value from the Vite environment variable `VITE_VERIFIER_V1_API`.
// 3️⃣ Default Concordium testnet verifier URL.
export function getVerifierURL(): string {
    return (window as any).VERIFIER_V1_API || process.env.VITE_VERIFIER_V1_API || CONCORDIUM_TESTNET_VERIFIER_V1;
}

async function submitProof(
    provider: WalletProvider,
    client: ConcordiumGRPCClient,
    statements: TopLevelStatements,
    claimsType: SubjectClaimsType,
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined,
    setMessages: (updateMessage: (oldMessages: string[]) => string[]) => void,
    setProofData?: (proof: VerifiablePresentationV1.Type) => void, // optional param to store proof data
    useVerifierService = true,
    withPublicInfo = true
) {
    if (statements.length == 0) {
        console.error('Create the statement in the column on the left and submit the anchor transaction first.');
        throw new Error('Create the statement in the column on the left and submit the anchor transaction first.');
    }

    if (anchorTransactionHash == undefined) {
        console.error(`Submit an anchor transaction first.`);
        throw new Error(`Submit an anchor transaction first.`);
    }

    const subjectClaims = getSubjectClaims(statements, claimsType);

    const verificationRequest = VerificationRequestV1.create(context, subjectClaims, anchorTransactionHash);

    let proof: VerifiablePresentationV1.Type;

    try {
        proof = await provider.requestVerifiablePresentationV1(verificationRequest);
        console.log(JSON.stringify(proof));
        console.log(proof);
    } catch (err) {
        if (err instanceof Error) {
            setMessages((oldMessages) => [...oldMessages, `Could not get proof: ${err.message}`]);
        } else {
            console.log(err);
        }
        return;
    }

    const auditRecordId = '12345';
    let errorMessage: string | undefined;

    if (useVerifierService) {
        const resp = await fetch(`${getVerifierURL()}/verifiable-presentations/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                auditRecordId,
                publicInfo: withPublicInfo
                    ? {
                          someSessionObject: {
                              id: crypto.randomUUID(),
                              issuer: 'some issuer',
                              additionalData: {
                                  randomValue: Math.random(),
                              },
                          },
                          anotherKey: {
                              someNestedData: 'some value',
                          },
                      }
                    : undefined,
                presentation: proof,
                verificationRequest,
            }),
        });

        let body = undefined;
        let raw = '';

        try {
            raw = await resp.text();
            body = JSON.parse(raw);
        } catch {
            body = undefined;
        }

        if (!resp.ok) {
            errorMessage = `Proof not OK: (${resp.status}) ${raw || resp.statusText}`;
        } else {
            const result = body?.result ?? body;
            const failed = result?.failed;

            if (failed) {
                errorMessage = `Proof not OK: ${failed.message}${
                    failed.code !== undefined ? ` (code: ${failed.code})` : ''
                }`;
            }
        }
    } else {
        const verificationResult = await VerificationAuditRecordV1.createChecked(
            auditRecordId,
            verificationRequest,
            proof,
            client,
            NETWORK
        );
        if (verificationResult.type !== `success`) {
            errorMessage = `Proof not OK: ${JSON.stringify(verificationResult)}`;
        }
    }

    if (errorMessage) {
        setMessages((oldMessages) => [...oldMessages, errorMessage]);
        return;
    }

    setMessages((oldMessages) => [...oldMessages, 'Proof OK']);
    setProofData?.(proof);
}

export function SubmitProofV1(
    provider: WalletProvider | undefined,
    client: ConcordiumGRPCClient,
    statements: TopLevelStatements,
    claimsType: SubjectClaimsType,
    context: VerificationRequestV1.Context,
    anchorTransactionHash: TransactionHash.Type | undefined
): [(messages: string[]) => any, React.JSX.Element] {
    const [messages, setMessages] = useState<string[]>([]);
    const [currentProof, setCurrentProof] = useState<VerifiablePresentationV1.Type | null>(null);
    const [isProofDetailsOpen, setIsProofDetailsOpen] = useState<boolean>(false);

    const [useVerifierService, setUseVerifierService] = useState<boolean>(true);
    const [withPublicInfo, setWithPublicInfo] = useState<boolean>(true);

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
                    <div>
                        <div className="form-check form-switch mb-2">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="useVerifierServiceToggle"
                                checked={useVerifierService}
                                onChange={(e) => setUseVerifierService(e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="useVerifierServiceToggle">
                                {useVerifierService ? 'Use verifier service' : 'Do not use verifier service'}
                            </label>
                        </div>
                        <div className="form-check form-switch mb-2">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="publicInfoToggleV1"
                                checked={withPublicInfo}
                                onChange={(e) => setWithPublicInfo(e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="publicInfoToggleV1">
                                {withPublicInfo ? 'With public info in VAA anchor' : 'No public info in VAA anchor'}
                            </label>
                        </div>
                        <button
                            title="Submit the statement as a verified presentation request to the wallet."
                            onClick={() =>
                                submitProof(
                                    provider,
                                    client,
                                    statements,
                                    claimsType,
                                    context,
                                    anchorTransactionHash,
                                    setMessages,
                                    setCurrentProof,
                                    useVerifierService,
                                    withPublicInfo
                                )
                            }
                            type="button"
                            className="col-sm-4 btn btn-primary"
                        >
                            {'ProveV1'}
                        </button>
                    </div>
                )}
            </div>
            <hr />
            <div>
                <ol>
                    {messages.map((m, index) => {
                        if (m === 'Proof OK' && currentProof) {
                            return (
                                <li
                                    key={index}
                                    className="alert alert-success d-flex justify-content-between align-items-center"
                                >
                                    <span>{m}</span>
                                    <button onClick={handleViewDetails} className="btn btn-sm btn-outline-success">
                                        View Details
                                    </button>
                                </li>
                            );
                        }
                        return (
                            <li key={index} className="alert alert-success">
                                {m}
                            </li>
                        );
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
