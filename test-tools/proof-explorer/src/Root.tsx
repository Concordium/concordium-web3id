/* eslint-disable no-alert */
import React, { useEffect, useState, MouseEventHandler, ChangeEventHandler, useRef, ChangeEvent } from 'react';
import Select from 'react-select';
import {
    AttributeKeyString,
    StatementTypes,
    AccountStatementBuild,
    AtomicStatementV2,
    VerifiablePresentation,
    CredentialStatements,
    CredentialStatement,
    ConcordiumGRPCClient,
    streamToList,
    ContractAddress,
    toBuffer,
    deserializeTypeValue,
    SmartContractTypeValues,
} from '@concordium/web-sdk';
import { Buffer } from 'buffer';
import { BrowserWalletProvider, WalletConnectProvider, WalletProvider } from './wallet-connection';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';

function getVerifierURL(): string {
    return 'https://web3id-verifier.testnet.concordium.com';
}

type TopLevelStatement =
    | { type: 'account'; statement: AccountStatement }
    | { type: 'web3id'; statement: Web3IdStatement };

type TopLevelStatements = TopLevelStatement[];

interface AccountStatement {
    idps: { name: string; id: number }[];
    statement: AtomicStatementV2[];
}

interface Web3IdStatement {
    issuers: ContractAddress[];
    statement: AtomicStatementV2[];
}

function Issuer({ outer_statement }: { outer_statement: TopLevelStatement }) {
    switch (outer_statement.type) {
        case 'account':
            if (outer_statement.statement.idps.length == 0) {
                return <div className="bg-danger"> No issuers selected for an account statement. </div>;
            } else {
                return (
                    <div className="bg-info p-1">
                        <p> Statement about an account credential </p>
                        <p> Allowed issuers </p>
                        <ul>
                            {outer_statement.statement.idps.map(({ name, id }) => {
                                return <li> {`${id}:${name}`} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
        case 'web3id':
            if (outer_statement.statement.issuers.length == 0) {
                return <div className="bg-danger"> No issuers selected for Web3Id credential statement. </div>;
            } else {
                return (
                    <div className="bg-success p-1">
                        <p> Statement about a Web3ID credential </p>
                        <p> Allowed issuers </p>

                        <ul className="bg-success">
                            {outer_statement.statement.issuers.map((inst) => {
                                return <li> {[inst.index, inst.subindex].toString()} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
    }
}

/**
 * Component to display the statement.
 */
function Statement({ inner }: { inner: TopLevelStatements }) {
    return inner.map((outer_statement) => (
        <>
            <Issuer outer_statement={outer_statement} />
            <div>
                {outer_statement.statement.statement.map((s) => {
                    switch (s.type) {
                        case StatementTypes.RevealAttribute:
                            return (
                                <div className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Reveal attribute'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeInRange:
                            return (
                                <div className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute in range'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Lower: '} {s.lower.toString()}
                                        </p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Upper: '} {s.upper.toString()}
                                        </p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeInSet:
                            return (
                                <div className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute in set'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Set: '} {s.set.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeNotInSet:
                            return (
                                <div className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute not in set'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Set: '} {s.set.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            );
                    }
                })}{' '}
            </div>{' '}
        </>
    ));
}

interface RevealAttributeProps {
    setStatement: (ns: AtomicStatementV2[]) => void;
    attributeOptions: { value: string; label: string }[];
}

async function submitProof(
    statement: CredentialStatements,
    provider: WalletProvider,
    setMessages: (cbk: (oldMessages: string[]) => string[]) => void
) {
    let proof: VerifiablePresentation;
    const challengeBuffer = new Uint8Array(32);
    crypto.getRandomValues(challengeBuffer);
    const challenge = Buffer.from(challengeBuffer).toString('hex');
    try {
        proof = await provider.requestVerifiablePresentation(challenge, statement);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        if (err instanceof Error) {
            setMessages((oldMessages) => [...oldMessages, `Could not get proof: ${err.message}`]);
        } else {
            console.log(err);
        }
        return;
    }
    console.log(JSON.stringify(proof));
    const resp = await fetch(`${getVerifierURL()}/v0/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(proof),
    });
    if (resp.ok) {
        setMessages((oldMessages) => [...oldMessages, 'Proof OK']);
    } else {
        const body = await resp.json();
        setMessages((oldMessages) => [...oldMessages, `Proof not OK: (${resp.status}) ${body}`]);
    }
}

function SubmitProof({ all_statements, provider }: { all_statements: TopLevelStatements; provider: WalletProvider }) {
    const [messages, setMessages] = useState<string[]>([]);

    const request = all_statements.map((s) => {
        switch (s.type) {
            case 'account':
                return {
                    statement: s.statement.statement,
                    idQualifier: {
                        type: 'cred',
                        issuers: s.statement.idps.map((x) => x.id),
                    },
                } as CredentialStatement;
            case 'web3id':
                return {
                    statement: s.statement.statement,
                    idQualifier: {
                        type: 'sci',
                        issuers: s.statement.issuers,
                    },
                } as CredentialStatement;
        }
    });

    const handleProve: MouseEventHandler<HTMLButtonElement> = () => submitProof(request, provider, setMessages);

    return (
        <div>
            <div>
                <button onClick={handleProve} type="button" className="btn btn-primary mt-1">
                    {'Prove'}
                </button>
            </div>
            <hr />
            <div>
                <ol>
                    {' '}
                    {messages.map((m) => (
                        <li className="alert alert-success"> {m} </li>
                    ))}{' '}
                </ol>
            </div>
        </div>
    );
}

const accountAttributeNames = Object.values(AttributeKeyString).map((ak) => {
    return { value: ak, label: ak };
});

function RevealAttribute({ setStatement, attributeOptions }: RevealAttributeProps) {
    const [selected, setSelected] = useState<string>(attributeOptions[0].label);

    const handleChange = (option: { value: string; label: string } | null) => {
        if (option === null) {
            return;
        }
        setSelected(option.label);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: StatementTypes.RevealAttribute,
                attributeTag: selected,
            },
        ]);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary p-1">
                <label>{'Reveal attribute.'} </label>
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                <div>
                    {' '}
                    <button onClick={onClickAdd} type="button" className="btn btn-primary">
                        {'Add'}
                    </button>{' '}
                </div>
            </div>
        </form>
    );
}

interface ExtendStatementProps {
    setStatement: (ns: AtomicStatementV2[]) => void;
}

function AgeInRange({ setStatement }: ExtendStatementProps) {
    const [lower, setLower] = useState<string>('18');
    const [upper, setUpper] = useState<string>('64');

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower(e.target.value);
    };

    const onUpperChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setUpper(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        // Since addAgeInRange does some arithmetic we need to parse inputs as integers
        // first. Otherwise we get unexpected behaviour.
        builder.addAgeInRange(parseInt(lower), parseInt(upper));
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove age in range'} </label> <br />
                {'Lower age: '}
                <input className="my-1" onChange={onLowerChange} value={lower} />
                <br />
                {'Upper age: '}
                <input className="my-1" onChange={onUpperChange} value={upper} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

interface AgeBoundProps extends ExtendStatementProps {
    younger: boolean;
}

function AgeBound({ younger, setStatement }: AgeBoundProps) {
    const [bound, setBound] = useState<string>('18');

    const onBoundChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setBound(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        // since addMaximumage and addMinimumAge do some arithmetic with the
        // bound we have to parse it to avoid weird behaviour that results from
        // adding and subtracting numbers and strings
        if (younger) {
            builder.addMaximumAge(parseInt(bound));
        } else {
            builder.addMinimumAge(parseInt(bound));
        }
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove${younger ? ' younger ' : ' older '}than`} </label> <br />
                <input className="my-1" onChange={onBoundChange} value={bound} />
                <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

function AttributeInRange({ setStatement, attributeOptions }: RevealAttributeProps) {
    const [lower, setLower] = useState<string>('');
    const [upper, setUpper] = useState<string>('');

    const [selected, setSelected] = useState<string>(attributeOptions[0].value);

    const handleChange = (option: { value: string; label: string } | null) => {
        if (option === null) {
            return;
        }
        setSelected(option.label);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: StatementTypes.AttributeInRange,
                attributeTag: selected,
                lower,
                upper,
            },
        ]);
    };

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower(e.target.value);
    };

    const onUpperChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setUpper(e.target.value);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove attribute in range'} </label> <br />
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                {'Lower bound: '}
                <input className="my-1" onChange={onLowerChange} value={lower} />
                <br />
                {'Upper bound: '}
                <input className="my-1" onChange={onUpperChange} value={upper} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

interface SetMembershipProps extends RevealAttributeProps {
    member: boolean;
}

function AttributeInSet({ member, setStatement, attributeOptions }: SetMembershipProps) {
    const [set, setSet] = useState<string>('');

    const [selected, setSelected] = useState<string>(attributeOptions[0].value);

    const handleChange = (option: { value: string; label: string } | null) => {
        if (option === null) {
            return;
        }
        setSelected(option.label);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: member ? StatementTypes.AttributeInSet : StatementTypes.AttributeNotInSet,
                attributeTag: selected,
                set: set.split(',').map((s) => s.trim()),
            },
        ]);
    };

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove attribute${member ? ' ' : ' not '} in set`} </label> <br />
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                {'Set: '}
                <input className="my-1" onChange={onLowerChange} value={set} />
                <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

function DocumentExpiryNoEarlier({ setStatement }: ExtendStatementProps) {
    const [lower, setLower] = useState<string>('20250505');

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        builder.documentExpiryNoEarlierThan(lower);
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove doc expiry no earlier than'} </label> <br />
                <input className="my-1" onChange={onLowerChange} value={lower} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

function DocumentIssuerIn({ setStatement }: ExtendStatementProps) {
    const [set, setSet] = useState<string>('');

    const onSetChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        builder.addMembership(
            AttributeKeyString.idDocIssuer,
            set.split(',').map((e) => e.trim())
        );
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove document issuer in'} </label> <br />
                <input className="my-1" onChange={onSetChange} value={set} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

interface ExtendSetStatementProps extends ExtendStatementProps {
    member: boolean;
    attribute: string;
}

function AttributeIn({ attribute, member, setStatement }: ExtendSetStatementProps) {
    const [set, setSet] = useState<string>('');

    const onSetChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        if (member) {
            builder.addMembership(
                attribute,
                set.split(',').map((e) => e.trim())
            );
        } else {
            builder.addNonMembership(
                attribute,
                set.split(',').map((e) => e.trim())
            );
        }

        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove ${attribute}${member ? ' ' : ' not '}in`} </label> <br />
                <input className="my-1" onChange={onSetChange} value={set} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

interface SpecialSetProps extends ExtendStatementProps {
    // if nationality is set then produce statement about EU nationality
    // otherwise about EU residence
    nationality: boolean;
}

function EUAttributeIn({ nationality, setStatement }: SpecialSetProps) {
    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new AccountStatementBuild();
        if (nationality) {
            builder.addEUNationality();
        } else {
            builder.addEUResidency();
        }

        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove ${nationality ? 'nationality in EU' : 'residence in EU'}`} </label> <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

function IdentityProviders({ idps }: { idps: { name: string; id: number }[] }): [number[], React.JSX.Element[]] {
    const [checked, setChecked] = useState<number[]>([]);
    const handleCheck = (event: ChangeEvent<HTMLInputElement>) => {
        let updatedList = [...checked];
        if (event.target.checked) {
            updatedList = [...checked, parseInt(event.target.value)];
        } else {
            updatedList.splice(checked.indexOf(parseInt(event.target.value)), 1);
        }
        setChecked(updatedList);
    };

    return [
        checked,
        idps.map(({ name, id }) => (
            <div className="form-check">
                <input
                    className="form-check-input"
                    type="checkbox"
                    value={id}
                    id="flexCheckChecked"
                    onChange={handleCheck}
                    checked={checked.includes(id)}
                />
                <label className="form-check-label">{name}</label>
            </div>
        )),
    ];
}

const REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA =
    'FAADAAAADwAAAGlzc3Vlcl9tZXRhZGF0YRQAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAAPAAAAY3JlZGVudGlhbF90eXBlFAABAAAADwAAAGNyZWRlbnRpYWxfdHlwZRYAEQAAAGNyZWRlbnRpYWxfc2NoZW1hFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAA';

function Issuers(
    indexes: string,
    client: ConcordiumGRPCClient
): [{ value: string; label: string }[], React.JSX.Element] {
    const issuers = parseIssuers(indexes);

    const [tags, setTags] = useState<{ value: string; label: string }[]>([
        { value: 'Dummy', label: 'Dummy value for testing' },
    ]);

    useEffect(() => {
        const fetchContracts = async () => {
            setTags([{ value: 'Dummy', label: 'Dummy value for testing' }]);
            for (let i = 0; i < issuers.length; i++) {
                const addr = { index: issuers[i], subindex: BigInt(0) };
                try {
                    const ci = await client.getInstanceInfo(addr);
                    const name = ci.name.substring(5);
                    const response = await client.invokeContract({
                        contract: { index: issuers[i], subindex: BigInt(0) },
                        method: `${name}.registryMetadata`,
                    });
                    switch (response.tag) {
                        case 'failure':
                            console.log(`Failed to get registry metadata for ${issuers[i]}`);
                            continue;
                        case 'success':
                            const metadata = deserializeTypeValue(
                                toBuffer(response.returnValue as string, 'hex'),
                                toBuffer(REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA, 'base64')
                            ) as {
                                [key: string]: SmartContractTypeValues;
                            };

                            const schema_url = metadata['credential_schema'] as { schema_ref: { url: string } };
                            console.log(schema_url.schema_ref.url);
                            const schema_response = await fetch(schema_url.schema_ref.url);
                            if (schema_response.ok) {
                                const schema = (await schema_response.json()) as {
                                    name: string;
                                    properties: {
                                        credentialSubject: {
                                            properties: {
                                                attributes: {
                                                    properties: object;
                                                };
                                            };
                                        };
                                    };
                                };
                                const attributes = schema.properties.credentialSubject.properties.attributes.properties;
                                Object.entries(attributes).map(([tag, v]) => {
                                    setTags((oldTags) => {
                                        if (
                                            oldTags.find(({ label }) => {
                                                return label == tag;
                                            })
                                        ) {
                                            return oldTags;
                                        } else {
                                            return [{ value: (v as { title: string }).title, label: tag }, ...oldTags];
                                        }
                                    });
                                });
                            } else {
                                console.log(`Unable to get schema from ${schema_url}`);
                            }
                    }
                } catch (e) {
                    console.log(e);
                }
            }
        };

        fetchContracts().catch((err) => console.log(err));
    }, [indexes]);

    return [
        tags,
        <ul>
            {issuers.map((idx) => (
                <li> &lt;{idx.toString()},0&gt; </li>
            ))}
        </ul>,
    ];
}

function parseIssuers(s: string): bigint[] {
    return s
        .split(',')
        .filter((x) => x.trim().length != 0)
        .map((x) => {
            try {
                return BigInt(parseInt(x));
            } catch (e) {
                return undefined;
            }
        })
        .filter((x) => x != undefined)
        .map((x) => x as bigint);
}

/**
 * The main component.
 */
export default function ProofExplorer() {
    const [provider, setProvider] = useState<WalletProvider>();

    useEffect(() => {
        if (provider !== undefined) {
            return () => {
                provider?.disconnect?.().then(() => provider.removeAllListeners());
            };
        }
    }, [provider]);

    const connectProvider = async (provider: WalletProvider) => {
        await provider.connect();
        setProvider(provider);
    };

    const [statement, setStatement] = useState<TopLevelStatements>([]);

    const client = useRef(
        new ConcordiumGRPCClient(new GrpcWebFetchTransport({ baseUrl: 'https://grpc.testnet.concordium.com:20000' }))
    );

    const [idps, setIdps] = useState<{ name: string; id: number }[]>([]);

    useEffect(() => {
        streamToList(client.current.getIdentityProviders()).then((chainIdps) => {
            setIdps(
                chainIdps.map((idp) => {
                    return { name: idp.ipDescription.name, id: idp.ipIdentity };
                })
            );
        });
    }, []);

    const [checked, idpsDisplay] = IdentityProviders({ idps });

    const [newStatement, setNewStatement] = useState<boolean>(true);

    const addAccountStatement = (a: AtomicStatementV2[]) => {
        setStatement((statements) => {
            if (newStatement || statements.length == 0) {
                setNewStatement(false);
                const statement: AccountStatement = {
                    idps: idps.filter(({ id }) => checked.includes(id)),
                    statement: a,
                };
                return [...statements, { type: 'account', statement: statement }];
            } else {
                statements[statements.length - 1].statement.statement =
                    statements[statements.length - 1].statement.statement.concat(a);
                return [...statements]; // copy the array to force component updates.
            }
        });
    };

    const [issuers, setIssuers] = useState<string>('');

    const addWeb3IdStatement = (a: AtomicStatementV2[]) => {
        setStatement((statements) => {
            if (newStatement || statements.length == 0) {
                setNewStatement(false);
                const statement: Web3IdStatement = {
                    issuers: parseIssuers(issuers).map((i) => {
                        return { index: i, subindex: BigInt(0) };
                    }),
                    statement: a,
                };
                return [...statements, { type: 'web3id', statement: statement }];
            } else {
                statements[statements.length - 1].statement.statement =
                    statements[statements.length - 1].statement.statement.concat(a);
                return [...statements]; // copy the array to force component updates.
            }
        });
    };

    const handleAddTopLevel: MouseEventHandler<HTMLButtonElement> = () => {
        setNewStatement(true);
    };

    const onIssuersChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setIssuers(e.target.value);
    };

    const [web3IdAttributes, issuersDisplay] = Issuers(issuers, client.current);

    return (
        <main className="container">
            <nav className="navbar bg-black mb-3">
                <div className="container-fluid">
                    <a className="navbar-brand text-white" href="#">
                        {'Proof explorer'}
                    </a>
                </div>
            </nav>
            <div className="row">
                <div className="col-sm">
                    <div className="bg-success mb-3 p-3 text-white">
                        {' '}
                        Construct a statement about a web3id credential.{' '}
                    </div>
                    <div className="bg-success mb-3 p-3 text-white">
                        <input className="my-1" onChange={onIssuersChange} value={issuers.toString()} />
                        {issuersDisplay}
                    </div>
                    <div>
                        <RevealAttribute setStatement={addWeb3IdStatement} attributeOptions={web3IdAttributes} />
                    </div>
                    <div>
                        <AttributeInRange setStatement={addWeb3IdStatement} attributeOptions={web3IdAttributes} />
                    </div>
                    <div>
                        <AttributeInSet
                            member={true}
                            setStatement={addWeb3IdStatement}
                            attributeOptions={web3IdAttributes}
                        />
                    </div>
                    <div>
                        <AttributeInSet
                            member={false}
                            setStatement={addWeb3IdStatement}
                            attributeOptions={web3IdAttributes}
                        />
                    </div>
                </div>
                <div className="col-sm">
                    <div className="bg-black mb-3 p-3 text-white">
                        Construct a statement about an account credential
                    </div>
                    <div className="bg-black mb-3 p-3 text-white">
                        Select which identity providers to allow
                        {idpsDisplay}
                    </div>
                    <div>
                        <RevealAttribute setStatement={addAccountStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AgeBound younger={true} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AgeBound younger={false} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AgeInRange setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <DocumentExpiryNoEarlier setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <DocumentIssuerIn setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={true}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.nationality}
                            member={false}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={true}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <AttributeIn
                            attribute={AttributeKeyString.countryOfResidence}
                            member={false}
                            setStatement={addAccountStatement}
                        />
                    </div>
                    <div>
                        <EUAttributeIn nationality={true} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <EUAttributeIn nationality={false} setStatement={addAccountStatement} />
                    </div>
                    <div>
                        <AttributeInRange setStatement={addAccountStatement} attributeOptions={accountAttributeNames} />
                    </div>
                    <div>
                        <AttributeInSet
                            member={true}
                            setStatement={addAccountStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                    <div>
                        <AttributeInSet
                            member={false}
                            setStatement={addAccountStatement}
                            attributeOptions={accountAttributeNames}
                        />
                    </div>
                </div>
                <div className="col-sm">
                    <div>
                        <button
                            className="btn btn-primary me-1"
                            onClick={async () => connectProvider(await BrowserWalletProvider.getInstance())}
                        >
                            Connect browser
                        </button>
                        <button
                            className="btn btn-primary"
                            disabled
                            onClick={async () => connectProvider(await WalletConnectProvider.getInstance())}
                        >
                            Connect mobile
                        </button>
                    </div>
                    <hr />
                    <button onClick={handleAddTopLevel} type="button" className="btn btn-primary me-1 mt-1">
                        {'Start a new inner statement'}
                    </button>

                    <hr />

                    <button
                        onClick={() =>
                            setStatement((oldStatement) => {
                                if (oldStatement.length == 0) {
                                    return oldStatement;
                                } else {
                                    return oldStatement.slice(0, oldStatement.length - 1);
                                }
                            })
                        }
                        type="button"
                        className="btn btn-primary mt-1"
                    >
                        {'Clear last inner statement'}
                    </button>

                    <hr />

                    {provider !== undefined && <SubmitProof all_statements={statement} provider={provider} />}

                    <hr />
                    <div className="bg-warning mb-3 p-3"> The statement </div>
                    <Statement inner={statement} />
                </div>
            </div>
        </main>
    );
}
