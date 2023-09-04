/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useCallback } from 'react';
import { saveAs } from 'file-saver';
import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
} from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { AccountAddress, TransactionKindString, TransactionSummaryType } from '@concordium/web-sdk';
import { TailSpin } from 'react-loader-spinner';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { createNewIssuer } from './writing_to_blockchain';

import {
    EXAMPLE_CREDENTIAL_SCHEMA,
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    EXAMPLE_ISSUER_METADATA,
    EXAMPLE_CREDENTIAL_SCHEMA_OBJECT,
    EXAMPLE_ISSUER_METADATA_OBJECT,
    EXAMPLE_CREDENTIAL_METADATA_OBJECT,
} from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
    note: string;
}>;

type CredentialSchema = {
    name: string;
    description: string;
    type: string;
    properties: {
        credentialSubject: {
            type: string;
            properties: {
                id: {
                    title: string;
                    type: string;
                    description: string;
                };
                attributes: {
                    title: string;
                    description: string;
                    type: string;
                    properties: object;
                    required: string[];
                };
            };
            required: string[];
        };
    };
    required: string[];
};

type SchemaRef = {
    schema_ref: {
        hash: {
            None: [];
        };
        url: string;
    };
};

function TestBox({ header, children, note }: TestBoxProps) {
    return (
        <fieldset className="testBox">
            <legend>{header}</legend>
            <div className="testBoxFields">{children}</div>
            <br />
            <p className="note">{note}</p>
        </fieldset>
    );
}

async function addRevokationKey(
    revocationKeys: string[],
    setRevocationKeys: (value: string[]) => void,
    setRevoationKeyInput: (value: string) => void,
    newRevocationKey: string
) {
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

async function addAttribute(
    attributes: object[],
    setAttributes: (value: object[]) => void,
    attributeTitle: string | undefined,
    attributeDescription: string | undefined,
    isRequired: boolean,
    type: string | undefined,
    credentialSchema: CredentialSchema
) {
    if (attributeTitle === undefined) {
        throw new Error(`AttributeTitle needs to be set`);
    }

    if (attributeDescription === undefined) {
        throw new Error(`AttributeDescription needs to be set`);
    }

    if (type === undefined) {
        throw new Error(`Type needs to be set`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attributes.forEach((value: any) => {
        if (value[attributeTitle.replaceAll(' ', '')] !== undefined) {
            throw new Error(`Duplicate attribute key: "${attributeTitle}"`);
        }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newAttribute: any = {};
    if (type === 'date-time') {
        newAttribute[attributeTitle.replaceAll(' ', '')] = {
            title: attributeTitle,
            type: 'object',
            description: attributeDescription,
            properties: {
                type: {
                    type: 'string',
                    const: 'date-time',
                },
                timestamp: {
                    type: 'string',
                    format: 'date-time',
                },
            },
            required: ['type', 'timestamp'],
        };
    } else {
        newAttribute[attributeTitle.replaceAll(' ', '')] = {
            title: attributeTitle,
            type,
            description: attributeDescription,
        };
    }

    credentialSchema.properties.credentialSubject.properties.attributes.properties = [...attributes, newAttribute];

    if (isRequired) {
        credentialSchema.properties.credentialSubject.properties.attributes.required.push(
            attributeTitle.replaceAll(' ', '')
        );
    }

    setAttributes([...attributes, newAttribute]);
}

interface ConnectionProps {
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
    active: number;
}

export default function Main(props: ConnectionProps) {
    const { walletConnectionProps, isTestnet, active } = props;
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } =
        walletConnectionProps;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [credentialSchema, setCredentialSchema] = useState(EXAMPLE_CREDENTIAL_SCHEMA_OBJECT);
    const [credentialMetadata, setCredentialMetadata] = useState(EXAMPLE_CREDENTIAL_METADATA_OBJECT);
    const [issuerMetadata, setIssuerMetadata] = useState(EXAMPLE_ISSUER_METADATA_OBJECT);
    const [attributes, setAttributes] = useState<object[]>([]);

    const [credentialName, setCredentialName] = useState('Education certificate');
    const [credentialDescription, setCredentialDescription] = useState(
        'Simple representation of an education certificate.'
    );

    const [backgroundColor, setBackgroundColor] = useState('#92a8d1');
    const [logo, setLogo] = useState('https://avatars.githubusercontent.com/u/39614219?s=200&v=4');
    const [title, setTitle] = useState('Example Title');

    const [iconURL, setIconURL] = useState('https://concordium.com/wp-content/uploads/2022/07/Concordium-1.png');
    const [URL, setURL] = useState('https://concordium.com');
    const [issuerDescription, setIssuerDescription] = useState('A public-layer 1, science-backed blockchain');
    const [issuerName, setIssuerName] = useState('Concordium');

    const [attributeTitle, setAttributeTitle] = useState<string | undefined>(undefined);
    const [attributeDescription, setAttributeDescription] = useState<string | undefined>(undefined);

    const [attributeType, setAttributeType] = useState<string>();
    const [required, setRequired] = useState(false);

    const [showCredentialSchema, setShowCredentialSchema] = useState(false);
    const [showCredentialMetadata, setShowCredentialMetadata] = useState(false);
    const [showIssuerMetadata, setShowIssuerMetadata] = useState(false);

    const [smartContractIndexError, setSmartContractIndexError] = useState('');
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState('');
    const [waitingForTransactionToFinialize, setWaitingForTransactionToFinialize] = useState(false);

    const [smartContractIndex, setSmartContractIndex] = useState('');

    const [viewErrorAccountBalance, setViewErrorAccountBalance] = useState('');
    const [transactionError, setTransactionError] = useState('');
    const [userInputError2, setUserInputError2] = useState('');

    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [issuerKey, setIssuerKey] = useState<string | undefined>(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const [accountBalance, setAccountBalance] = useState('');
    const [txHash, setTxHash] = useState('');

    const [issuerMetaData, setIssuerMetaData] = useState(EXAMPLE_ISSUER_METADATA);

    const [credentialType, setCredentialType] = useState('myCredentialType');
    const [schemaCredential, setSchemaCredential] = useState<SchemaRef>({
        schema_ref: {
            hash: {
                None: [],
            },
            url: EXAMPLE_CREDENTIAL_SCHEMA,
        },
    });

    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const changeDropDownHandler = () => {
        const e = document.getElementById('write') as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setAttributeType(value);
    };

    const changeAttributeDescription = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setAttributeDescription(target.value);
    }, []);

    const changeAttributeTitle = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setAttributeTitle(target.value);
    }, []);

    const changeIssuerMetaDataURLHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerMetaData(target.value);
    }, []);

    const changeCheckBox = useCallback((requiredValue: boolean, event: ChangeEvent) => {
        const target = event.target as HTMLInputElement;
        target.checked = !requiredValue;

        setRequired(!requiredValue);
    }, []);

    const changeCredentialDescription = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialDescription(target.value);

        const newCredentialSchema = credentialSchema;
        newCredentialSchema.description = target.value;
        setCredentialSchema(newCredentialSchema);
    }, []);

    const changeCredentialName = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialName(target.value);

        const newCredentialSchema = credentialSchema;
        newCredentialSchema.name = target.value;
        setCredentialSchema(newCredentialSchema);
    }, []);

    const changeBackgroundColor = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setBackgroundColor(target.value);

        const newCredentialMetadata = credentialMetadata;
        newCredentialMetadata.backgroundColor = target.value;
        setCredentialMetadata(newCredentialMetadata);
    }, []);

    const changeTitle = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setTitle(target.value);

        const newCredentialMetadata = credentialMetadata;
        newCredentialMetadata.title = target.value;
        setCredentialMetadata(newCredentialMetadata);
    }, []);

    const changeLogoURL = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setLogo(target.value);

        const newCredentialMetadata = credentialMetadata;
        newCredentialMetadata.logo.url = target.value;
        setCredentialMetadata(newCredentialMetadata);
    }, []);

    const changeIconURL = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIconURL(target.value);

        const newIssuerMetadata = issuerMetadata;
        newIssuerMetadata.icon.url = target.value;
        setIssuerMetadata(newIssuerMetadata);
    }, []);

    const changeURL = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setURL(target.value);

        const newIssuerMetadata = issuerMetadata;
        newIssuerMetadata.url = target.value;
        setIssuerMetadata(newIssuerMetadata);
    }, []);

    const changeIssuerDescription = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerDescription(target.value);

        const newIssuerMetadata = issuerMetadata;
        newIssuerMetadata.description = target.value;
        setIssuerMetadata(newIssuerMetadata);
    }, []);

    const changeIssuerName = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setIssuerName(target.value);

        const newIssuerMetadata = issuerMetadata;
        newIssuerMetadata.name = target.value;
        setIssuerMetadata(newIssuerMetadata);
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
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client, txHash]);

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                client
                    ?.getAccountInfo(new AccountAddress(account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                            setAccountExistsOnNetwork(true);
                        }
                        setViewErrorAccountBalance('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setViewErrorAccountBalance((e as Error).message.replaceAll('%20', ' '));
                        setAccountExistsOnNetwork(false);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    useEffect(() => {
        if (connection && account) {
            client
                ?.getAccountInfo(new AccountAddress(account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                        setAccountExistsOnNetwork(true);
                    }
                    setViewErrorAccountBalance('');
                })
                .catch((e) => {
                    setViewErrorAccountBalance((e as Error).message.replaceAll('%20', ' '));
                    setAccountBalance('');
                    setAccountExistsOnNetwork(false);
                });
        }
    }, [connection, account]);

    return (
        <main className="container">
            <div className="textCenter">
                <WalletConnectionTypeButton
                    connectorType={BROWSER_WALLET}
                    connectorName="Browser Wallet"
                    setWaitingForUser={setWaitingForUser}
                    connection={connection}
                    {...walletConnectionProps}
                />
                {activeConnectorError && (
                    <p className="alert alert-danger" role="alert">
                        Connector Error: {activeConnectorError}.
                    </p>
                )}
                {!activeConnectorError && !isWaitingForTransaction && activeConnectorType && !activeConnector && (
                    <p>
                        <i>Loading connector...</i>
                    </p>
                )}
                {connectError && (
                    <p className="alert alert-danger" role="alert">
                        Connect Error: {connectError}.
                    </p>
                )}
                {!connection && !isWaitingForTransaction && activeConnectorType && activeConnector && (
                    <p>
                        <button className="btn btn-primary me-1" type="button" onClick={connect}>
                            {isConnecting && 'Connecting...'}
                            {!isConnecting && activeConnectorType === BROWSER_WALLET && 'Connect Browser Wallet'}
                        </button>
                    </p>
                )}
                {connection && !accountExistsOnNetwork && (
                    <>
                        <div className="alert alert-danger" role="alert">
                            Please ensure that your browser wallet is connected to network `
                            {walletConnectionProps.network.name}` and you have an account in that wallet that is
                            connected to this website.
                        </div>
                        <div className="alert alert-danger" role="alert">
                            Alternatively, if you intend to use `{isTestnet ? 'mainnet' : 'testnet'}`, go back to step 1
                            and switch the network button.
                        </div>
                    </>
                )}
            </div>
            {account && (
                <div className="row">
                    {connection && account !== undefined && (
                        <div>
                            <br />
                            <div className="label">Connected account:</div>
                            <div>
                                <div>
                                    <a
                                        className="link"
                                        href={`https://${
                                            isTestnet ? `testnet.` : ``
                                        }ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {account}
                                    </a>
                                </div>
                            </div>
                            <br />
                            <div className="label">Your account balance:</div>
                            <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                            <br />
                            {viewErrorAccountBalance && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorAccountBalance}.
                                </div>
                            )}
                            {active === 3 && (
                                <>
                                    <TestBox header="" note="">
                                        Add <strong>CredentialName</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="issuerKey"
                                            type="text"
                                            value={credentialName}
                                            onChange={changeCredentialName}
                                        />
                                        <br />
                                        <br />
                                        Add <strong>CredentialDescription</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="credentialDescription"
                                            type="text"
                                            value={credentialDescription}
                                            onChange={changeCredentialDescription}
                                        />
                                        <br />
                                        <br />
                                        <TestBox header="" note="">
                                            Add <strong>AttributeTitle</strong>:
                                            <br />
                                            <input
                                                className="inputFieldStyle"
                                                id="attributeTitle"
                                                type="text"
                                                value={attributeTitle}
                                                onChange={changeAttributeTitle}
                                            />
                                            <br />
                                            <br />
                                            Add <strong>AttributeDescription</strong>:
                                            <br />
                                            <input
                                                className="inputFieldStyle"
                                                id="attributeDescription"
                                                type="text"
                                                value={attributeDescription}
                                                onChange={changeAttributeDescription}
                                            />
                                            <label className="field">
                                                Select Type:
                                                <br />
                                                <br />
                                                <select name="write" id="write" onChange={changeDropDownHandler}>
                                                    <option value="choose" disabled selected>
                                                        Choose
                                                    </option>
                                                    <option value="integer">Integer</option>
                                                    <option value="string">String</option>
                                                    <option value="date-time">DateTime</option>
                                                </select>
                                            </label>
                                            <br />
                                            <br />
                                            <div>
                                                <input
                                                    type="checkbox"
                                                    id="checkBox"
                                                    name="checkBox"
                                                    onChange={(event) => changeCheckBox(required, event)}
                                                />
                                                <label htmlFor="checkBox"> Is Type Required</label>
                                            </div>
                                            <br />
                                            <br />
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                onClick={() => {
                                                    setUserInputError2('');
                                                    addAttribute(
                                                        attributes,
                                                        setAttributes,
                                                        attributeTitle,
                                                        attributeDescription,
                                                        required,
                                                        attributeType,
                                                        credentialSchema
                                                    ).catch((err: Error) => setUserInputError2((err as Error).message));
                                                }}
                                            >
                                                Add Attribute
                                            </button>
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                onClick={() => {
                                                    setAttributes([]);
                                                    setAttributeTitle('');
                                                    setAttributeDescription('');
                                                    setAttributeType(undefined);
                                                    setUserInputError2('');
                                                }}
                                            >
                                                Clear All Attributes
                                            </button>
                                            <br />
                                            {attributes.length !== 0 && (
                                                <>
                                                    <div className="actionResultBox">
                                                        <div>You have added the following `attributes`:</div>
                                                        <div>
                                                            <pre className="largeText">
                                                                {JSON.stringify(attributes, null, '\t')}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                    <br />
                                                    <br />
                                                </>
                                            )}
                                            {userInputError2 !== '' && (
                                                <div className="alert alert-danger" role="alert">
                                                    Error: {userInputError2}.
                                                </div>
                                            )}
                                        </TestBox>
                                        <br />
                                        <br />
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowCredentialSchema(true);
                                            }}
                                        >
                                            Create CredentialSchema
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowCredentialSchema(true);

                                                const fileName = 'credentialSchema.json';

                                                const fileToSave = new Blob([JSON.stringify(credentialSchema)], {
                                                    type: 'application/json',
                                                });

                                                saveAs(fileToSave, fileName);
                                            }}
                                        >
                                            Download CredentialSchema
                                        </button>
                                        {showCredentialSchema && (
                                            <pre className="largeText">
                                                {JSON.stringify(credentialSchema, null, '\t')}
                                            </pre>
                                        )}
                                    </TestBox>
                                    <TestBox header="" note="">
                                        Add <strong>Title</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="title"
                                            type="text"
                                            value={title}
                                            onChange={changeTitle}
                                        />
                                        <br />
                                        <br />
                                        Add <strong>LogoURL</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="logoURL"
                                            type="text"
                                            value={logo}
                                            onChange={changeLogoURL}
                                        />{' '}
                                        <br />
                                        <br />
                                        Add <strong>BackGroundColor</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="backgroundColor"
                                            type="text"
                                            value={backgroundColor}
                                            onChange={changeBackgroundColor}
                                        />
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowCredentialMetadata(true);
                                            }}
                                        >
                                            Create CredentialMetadata
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowCredentialMetadata(true);

                                                const fileName = 'credentialMetadata.json';

                                                const fileToSave = new Blob([JSON.stringify(credentialMetadata)], {
                                                    type: 'application/json',
                                                });

                                                saveAs(fileToSave, fileName);
                                            }}
                                        >
                                            Download CredentialMetadata
                                        </button>
                                        {showCredentialMetadata && (
                                            <pre className="largeText">
                                                {JSON.stringify(credentialMetadata, null, '\t')}
                                            </pre>
                                        )}
                                    </TestBox>
                                    <TestBox header="" note="">
                                        Add <strong>IssuerName</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="issuerName"
                                            type="text"
                                            value={issuerName}
                                            onChange={changeIssuerName}
                                        />
                                        <br />
                                        <br />
                                        Add <strong>IssuerDescription</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="issuerDescription"
                                            type="text"
                                            value={issuerDescription}
                                            onChange={changeIssuerDescription}
                                        />
                                        Add <strong>URL</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="URL"
                                            type="text"
                                            value={URL}
                                            onChange={changeURL}
                                        />
                                        <br />
                                        <br />
                                        Add <strong>IconURL</strong>:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="iconURL"
                                            type="text"
                                            value={iconURL}
                                            onChange={changeIconURL}
                                        />
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowIssuerMetadata(true);
                                            }}
                                        >
                                            Create IssuerMetadata
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setShowIssuerMetadata(true);

                                                const fileName = 'issuerMetadata.json';

                                                const fileToSave = new Blob([JSON.stringify(issuerMetadata)], {
                                                    type: 'application/json',
                                                });

                                                saveAs(fileToSave, fileName);
                                            }}
                                        >
                                            Download IssuerMetadata
                                        </button>
                                        {showIssuerMetadata && (
                                            <pre className="largeText">
                                                {JSON.stringify(issuerMetadata, null, '\t')}
                                            </pre>
                                        )}
                                    </TestBox>
                                </>
                            )}
                            {active === 4 && (
                                <TestBox header="" note="">
                                    Add <strong>IssuerKey</strong>:
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
                                    Add <strong>IssuerMetadata</strong>:
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
                                    Add <strong>CredentialType</strong>:
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
                                    Add <strong>CredentialSchema</strong>:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="credentialSchemaURL"
                                        type="text"
                                        value={schemaCredential.schema_ref.url}
                                        onChange={changeCredentialSchemaURLHandler}
                                    />
                                    <br />
                                    <br />
                                    {revocationKeys.length !== 0 && (
                                        <>
                                            <div className="actionResultBox">
                                                <div>You have added the following `revocationKeys`:</div>
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
                                    {userInputError2 !== '' && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {userInputError2}.
                                        </div>
                                    )}
                                    <Form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            setUserInputError2('');
                                            addRevokationKey(
                                                revocationKeys,
                                                setRevocationKeys,
                                                setRevocationKeyInput,
                                                revocationKeyInput
                                            ).catch((err: Error) => setUserInputError2((err as Error).message));
                                        }}
                                    >
                                        <div>
                                            Add <strong>RevocationKeys</strong>:
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
                                                        setUserInputError2('');
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

                                            const schemaCredentialURL = schemaCredential.schema_ref.url;

                                            const exampleCredentialSchema = {
                                                schema_ref: {
                                                    hash: {
                                                        None: [],
                                                    },
                                                    url: EXAMPLE_CREDENTIAL_SCHEMA,
                                                },
                                            };

                                            const tx = createNewIssuer(
                                                connection,
                                                account,
                                                issuerMetaData,
                                                issuerKey || '',
                                                schemaCredentialURL === '' ? exampleCredentialSchema : schemaCredential,
                                                JSON.stringify(revocationKeys),
                                                credentialType
                                            );
                                            tx.then(setTxHash).catch((err: Error) =>
                                                setTransactionError((err as Error).message)
                                            );
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
                            )}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
