/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useEffect, useState } from 'react';

import { useGrpcClient, TESTNET, MAINNET, WalletConnection } from '@concordium/react-components';
import { Button, Row, Form, Alert, Modal } from 'react-bootstrap';
import { TransactionKindString, TransactionSummaryType } from '@concordium/web-sdk';
import { TailSpin } from 'react-loader-spinner';

import { useForm } from 'react-hook-form';
import { createNewIssuer } from './writing_to_blockchain';

import { REFRESH_INTERVAL_IN_MILLI_SECONDS } from './constants';

async function addRevokationKey(
    revocationKeys: string[],
    setRevocationKeys: (value: string[]) => void,
    //  setRevoationKeyInput: (value: string) => void,
    newRevocationKey: string | undefined
) {
    if (newRevocationKey === undefined) {
        throw new Error(`Set revocation key`);
    }
    if (revocationKeys.includes(newRevocationKey)) {
        throw new Error(`Duplicate revocation key: ${newRevocationKey}`);
    }
    if (newRevocationKey.length !== 64) {
        throw new Error(`Revocation key should have a length of 64`);
    }
    if (newRevocationKey) {
        setRevocationKeys([...revocationKeys, newRevocationKey]);
        //  setRevoationKeyInput('');
    }
}

interface ConnectionProps {
    account: string;
    connection: WalletConnection;
    isTestnet: boolean;
}

interface DeployContractFormInterface {
    issuerPublicKey: string;
    issuerMetadataURL: string;
    credentialSchemaURL: string;
    credentialType: string;
}

// 'EC73BDE849ED13680F4CDB09C13D29D3E7B93ABDED30F19705C1D8F01AB79C74'
interface RevocationKeyInterface {
    revokationKey: string;
}

export default function DeployCredentialContract(props: ConnectionProps) {
    const { connection, account, isTestnet } = props;
    const deployContractForm = useForm<DeployContractFormInterface>();
    const attributes = useForm<RevocationKeyInterface>();

    const [smartContractIndexError, setSmartContractIndexError] = useState('');
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState('');
    const [waitingForTransactionToFinialize, setWaitingForTransactionToFinialize] = useState(false);

    const [smartContractIndex, setSmartContractIndex] = useState('');
    const [txHash, setTxHash] = useState('');
    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);

    const [show, setShow] = useState(false);
    const [error, setError] = useState('');

    const handleClose = () => setShow(false);

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHash !== '') {
            const interval = setInterval(() => {
                console.log('refreshing_smartContractIndex');
                client
                    .getBlockItemStatus(txHash)
                    .then((report) => {
                        if (report !== undefined) {
                            setViewErrorModuleReference('');
                            if (report.status === 'finalized') {
                                setWaitingForTransactionToFinialize(false);
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndexError('');
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setViewErrorModuleReference((e as Error).message);
                    });
            }, REFRESH_INTERVAL_IN_MILLI_SECONDS);
            return () => clearInterval(interval);
        }
    }, [connection, account, client, txHash]);

    return (
        <>
            <Modal show={show}>
                <Modal.Header>
                    <Modal.Title>Error</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <p>{error}</p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            <Form>
                <Form.Group className="mb-3">
                    <Form.Label>Issuer Public Key</Form.Label>
                    <Form.Control {...deployContractForm.register('issuerPublicKey', { required: true })} />
                    {deployContractForm.formState.errors.issuerPublicKey && (
                        <Alert key="info" variant="info">
                            {' '}
                            Issuer Public Key is required{' '}
                        </Alert>
                    )}
                    <Form.Text>
                        If you become an issuer, you will need to sign the credentials with your issuer{' '}
                        <strong>private key</strong> (ed25519 signature scheme). The public key must be registered in
                        the contract. For <strong>testing purposes</strong> on testnet, you can create a public-private
                        key pair with an{' '}
                        <a href="https://cyphr.me/ed25519_tool/ed.html" target="_blank" rel="noreferrer">
                            online tool
                        </a>{' '}
                        and use the <strong>public key</strong> here.
                    </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label>Issuer metadata URL</Form.Label>
                    <Form.Control {...deployContractForm.register('issuerMetadataURL', { required: true })} />
                    {deployContractForm.formState.errors.issuerMetadataURL && (
                        <Alert key="info" variant="info">
                            {' '}
                            Issuer metadata URL is required{' '}
                        </Alert>
                    )}
                    <Form.Text />
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label>Credential type</Form.Label>
                    <Form.Control {...deployContractForm.register('credentialType', { required: true })} />
                    {deployContractForm.formState.errors.credentialType && (
                        <Alert key="info" variant="info">
                            {' '}
                            Credential type is required{' '}
                        </Alert>
                    )}
                    <Form.Text>
                        You should define a type for your credential (e.g. `myCredentialType` or
                        `EducationalCertificate`).
                    </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label>Credential schema URL</Form.Label>
                    <Form.Control {...deployContractForm.register('credentialSchemaURL', { required: true })} />
                    {deployContractForm.formState.errors.credentialSchemaURL && (
                        <Alert key="info" variant="info">
                            {' '}
                            Credential schema URL is required{' '}
                        </Alert>
                    )}
                    <Form.Text />
                </Form.Group>

                <Form className="border">
                    <Form.Group className="mb-3">
                        <Form.Label>Revocation keys (optional)</Form.Label>
                        <Form.Control {...attributes.register('revokationKey', { required: true })} />
                        {/* {attributes.formState.errors.revokationKey && (
                            <Alert key="info" variant="info">
                                {' '}
                                Issuer metadata URL is required{' '}
                            </Alert>
                        )} */}
                        <Form.Text>
                            The keys inserted here can revoke any credential that the issuer issues. You can leave this
                            an empty array if you don&apos;t want to grant such permissions to special revocation keys.
                            For testing purposes on testnet, you can create public-private key pairs with an{' '}
                            <a href="https://cyphr.me/ed25519_tool/ed.html" target="_blank" rel="noreferrer">
                                {' '}
                                online tool{' '}
                            </a>
                            and use the <strong>public keys</strong> here.
                        </Form.Text>
                    </Form.Group>

                    <Button
                        variant="primary"
                        type="button"
                        onClick={attributes.handleSubmit((formData) => {
                            addRevokationKey(revocationKeys, setRevocationKeys, formData.revokationKey).catch(
                                (err: Error) => alert((err as Error).message)
                            );
                        })}
                    >
                        Add Revocation Keys
                    </Button>

                    <Button
                        variant="primary"
                        type="button"
                        onClick={attributes.handleSubmit(() => {
                            setRevocationKeys([]);
                        })}
                    >
                        Clear Revocation Keys
                    </Button>
                </Form>
                <Row />

                <Button
                    variant="primary"
                    type="button"
                    onClick={deployContractForm.handleSubmit((formData) => {
                        setTxHash('');
                        setError('');
                        setSmartContractIndex('');
                        setWaitingForTransactionToFinialize(true);

                        const tx = createNewIssuer(
                            connection,
                            account,
                            formData.issuerMetadataURL,
                            formData.issuerPublicKey,
                            formData.credentialSchemaURL,
                            JSON.stringify(revocationKeys),
                            formData.credentialType
                        );
                        tx.then(setTxHash).catch((err: Error) => {
                            setError((err as Error).message);
                            setWaitingForTransactionToFinialize(false);
                        });
                    })}
                >
                    Create New Issuer
                </Button>
            </Form>
            {revocationKeys.length !== 0 && <pre className="largeText">{JSON.stringify(revocationKeys, null, 2)}</pre>}
            {smartContractIndexError !== '' && (
                <div className="alert alert-danger" role="alert">
                    Error: {smartContractIndexError}.
                </div>
            )}
            {viewErrorModuleReference && (
                <div className="alert alert-danger" role="alert">
                    Error: {viewErrorModuleReference}.
                </div>
            )}
            {txHash && (
                <div>
                    <div>Transaction hash:</div>
                    <a
                        className="link"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://${
                            isTestnet ? `testnet.` : ``
                        }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHash}`}
                    >
                        {txHash}
                    </a>
                </div>
            )}
            <Row />
            {waitingForTransactionToFinialize === true && (
                <div className="d-flex justify-content-center">
                    <TailSpin
                        height="30"
                        width="30"
                        color="#308274"
                        ariaLabel="tail-spin-loading"
                        radius="1"
                        wrapperStyle={{}}
                        wrapperClass=""
                        visible
                    />
                    <div>Waiting for transaction to finalize</div>
                </div>
            )}
            <Row />
            {smartContractIndex !== '' && (
                <div className="actionResultBox">
                    Smart Contract Index:
                    <div>{smartContractIndex}</div>
                </div>
            )}
        </>
    );
}
