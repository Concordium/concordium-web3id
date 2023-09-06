/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, MouseEvent, useCallback } from 'react';

import { useGrpcClient, TESTNET, MAINNET, WalletConnection } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { TransactionKindString, TransactionSummaryType } from '@concordium/web-sdk';
import { TailSpin } from 'react-loader-spinner';

import { createNewIssuer } from './writing_to_blockchain';

import { REFRESH_INTERVAL_IN_MILLI_SECONDS } from './constants';

type SchemaRef = {
    schema_ref: {
        hash: {
            None: [];
        };
        url: string;
    };
};

function TestBox({ children }: PropsWithChildren) {
    return (
        <fieldset className="testBox">
            <div className="testBoxFields">{children}</div>
            <br />
        </fieldset>
    );
}

async function addRevokationKey(
    revocationKeys: string[],
    setRevocationKeys: (value: string[]) => void,
    setRevoationKeyInput: (value: string) => void,
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
        setRevoationKeyInput('');
    }
}

interface ConnectionProps {
    account: string;
    connection: WalletConnection;
    isTestnet: boolean;
}

export default function DeployCredentialContract(props: ConnectionProps) {
    const { connection, account, isTestnet } = props;

    const [smartContractIndexError, setSmartContractIndexError] = useState('');
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState('');
    const [waitingForTransactionToFinialize, setWaitingForTransactionToFinialize] = useState(false);

    const [smartContractIndex, setSmartContractIndex] = useState('');

    const [transactionError, setTransactionError] = useState('');
    const [userInputError, setUserInputError] = useState('');

    const [issuerKey, setIssuerKey] = useState<string | undefined>(undefined);
    const [txHash, setTxHash] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState<string | undefined>(undefined);

    const [credentialType, setCredentialType] = useState<string | undefined>(undefined);
    const [schemaCredential, setSchemaCredential] = useState<SchemaRef | undefined>(undefined);

    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState<string | undefined>(undefined);

    const display = useCallback((event: MouseEvent<HTMLElement>) => {
        const element = event.target as HTMLTextAreaElement;
        alert(element.parentElement?.title || element.parentElement?.parentElement?.title || element.title);
    }, []);

    const changeIssuerMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
    }, []);

    const changeIssuerKeyHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerKey(target.value);
    }, []);

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

    const changeCredentialSchemaURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setSchemaCredential({
            schema_ref: {
                hash: {
                    None: [],
                },
                url: target.value,
            },
        });
    }, []);

    const changeCredentialTypeHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialType(target.value);
    }, []);

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
        <TestBox>
            <div
                className="containerToolTip"
                role="presentation"
                onClick={display}
                data-toggle="tooltip"
                title="If you become an issuer, you will need to sign the credentials with your issuer private key at the backend before a credential that you issue can be added to a holder's wallet. For testing purposes on testnet, you can create a public-private key pair with an online tool (e.g. https://cyphr.me/ed25519_tool/ed.html) and use the public key as the isserKey here. The issuerKey should have a length of 64 characters e.g. `8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82`."
            >
                <div>
                    Add <strong>issuer public key</strong>
                </div>
                <div className="infolink" />
                &nbsp;:
            </div>
            <br />
            <input
                className="inputFieldStyle"
                id="issuerKey"
                type="text"
                value={issuerKey}
                onChange={changeIssuerKeyHandler}
            />
            <br />
            <br />
            <div
                className="containerToolTip"
                role="presentation"
                onClick={display}
                data-toggle="tooltip"
                title="The issuerMetadata file that you created in the previous step should be hosted on the web. You can for example host it on your gist account (`https://gist.github.com/`) and click the `raw` button to optain the URL. You should then input the URL where you host your issuerMetadata here (e.g. `https://gist.githubusercontent.com/DOBEN/d12deee42e06601efb72859da9be5759/raw/137a9a4b9623dfe16fa8e9bb7ab07f5858d92c53/gistfile1.txt`)."
            >
                <div>
                    Add <strong>issuer metadata URL</strong>
                </div>
                <div className="infolink" />
                &nbsp;:
            </div>
            <br />
            <input
                className="inputFieldStyle"
                id="issuerMetaDataURL"
                type="text"
                value={issuerMetaData}
                onChange={changeIssuerMetaDataURLHandler}
            />
            <br />
            <br />
            <div
                className="containerToolTip"
                role="presentation"
                onClick={display}
                data-toggle="tooltip"
                title="You should define a type for your credential (e.g. `myCredentialType` or `EducationalCertificate`)"
            >
                <div>
                    Add <strong>credential type</strong>
                </div>
                <div className="infolink" />
                &nbsp;:
            </div>
            <br />
            <input
                className="inputFieldStyle"
                id="credentialType"
                type="text"
                value={credentialType}
                onChange={changeCredentialTypeHandler}
            />
            <br />
            <br />
            <div
                className="containerToolTip"
                role="presentation"
                onClick={display}
                data-toggle="tooltip"
                title="The credentialSchema file that you created in the previous step should be hosted on the web. You can for example host it on your gist account (`https://gist.github.com/`) and click the `raw` button to optain the URL. You should then input the URL where you host your credentialSchema here (e.g. `https://gist.githubusercontent.com/DOBEN/bfe30ecea16f7a3ea1b87aa40902b9ac/raw/a8ab51fca489d04710fb19fb7122bb283dba719a/gistfile1.txt`)."
            >
                <div>
                    Add <strong>credential schema URL</strong>
                </div>
                <div className="infolink" />
                &nbsp;:
            </div>
            <br />
            <input
                className="inputFieldStyle"
                id="credentialSchemaURL"
                type="text"
                value={schemaCredential?.schema_ref.url}
                onChange={changeCredentialSchemaURLHandler}
            />
            <br />
            <br />
            {revocationKeys.length !== 0 && (
                <>
                    <div className="actionResultBox">
                        <div>
                            You have added the following <strong>revocationKeys</strong>:
                        </div>
                        <div>
                            {revocationKeys?.map((element) => (
                                <li key={element}>{element}</li>
                            ))}
                        </div>
                    </div>
                    <br />
                    <br />
                </>
            )}
            {userInputError !== '' && (
                <div className="alert alert-danger" role="alert">
                    Error: {userInputError}.
                </div>
            )}
            <Form
                onSubmit={(e) => {
                    e.preventDefault();
                    setUserInputError('');
                    addRevokationKey(
                        revocationKeys,
                        setRevocationKeys,
                        setRevocationKeyInput,
                        revocationKeyInput
                    ).catch((err: Error) => setUserInputError((err as Error).message));
                }}
            >
                <div
                    className="containerToolTip"
                    role="presentation"
                    onClick={display}
                    data-toggle="tooltip"
                    title="The keys inserted here can revoke any credential that you issue. You can leave this an empty array if you don't want to grant such permissions to special revocation keys. For testing purposes on testnet, you can create public-private key pairs with an online tool (e.g. https://cyphr.me/ed25519_tool/ed.html) and use the public keys here. Each revocationKey should have a length of 64 characters e.g. `8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82`."
                >
                    <div>
                        Add <strong>revocation keys</strong>
                    </div>
                    <div className="infolink" />
                    &nbsp;:
                </div>
                <br />
                <Row>
                    <Col sm={10}>
                        <InputGroup className="mb-3">
                            <Form.Control
                                value={revocationKeyInput}
                                onChange={(e) => setRevocationKeyInput(e.target.value)}
                            />
                            <Button type="submit" variant="outline-secondary">
                                Add
                            </Button>
                        </InputGroup>
                    </Col>
                    <Col sm={1}>
                        <Button
                            variant="outline-secondary"
                            onClick={() => {
                                setRevocationKeys([]);
                                setRevocationKeyInput('');
                                setUserInputError('');
                            }}
                        >
                            Clear
                        </Button>
                    </Col>
                </Row>
            </Form>
            <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                    setTxHash('');
                    setTransactionError('');
                    setSmartContractIndex('');
                    setWaitingForTransactionToFinialize(true);

                    const tx = createNewIssuer(
                        connection,
                        account,
                        issuerMetaData,
                        issuerKey,
                        schemaCredential,
                        JSON.stringify(revocationKeys),
                        credentialType
                    );
                    tx.then(setTxHash).catch((err: Error) => {
                        setTransactionError((err as Error).message);
                        setWaitingForTransactionToFinialize(false);
                    });
                }}
            >
                Create New Issuer
            </button>
            <br />
            <br />
            {!txHash && transactionError && (
                <div className="alert alert-danger" role="alert">
                    Error: {transactionError}.
                </div>
            )}
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
            <br />
            <br />
            {waitingForTransactionToFinialize === true && (
                <div className="containerTwoItems">
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
            {smartContractIndex !== '' && (
                <div className="actionResultBox">
                    Smart Contract Index:
                    <div>{smartContractIndex}</div>
                </div>
            )}
        </TestBox>
    );
}
