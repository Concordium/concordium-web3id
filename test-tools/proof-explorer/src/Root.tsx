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
    TimestampAttribute,
    ContractName,
    ReceiveName,
    EntrypointName,
} from '@concordium/web-sdk';
import { Buffer } from 'buffer';
import { BrowserWalletProvider, WalletConnectProvider, WalletProvider } from './wallet-connection';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { VERIFIER_URL, GRPC_WEB_CONFIG, REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA } from './constants';
import { version } from '../package.json';

function getVerifierURL(): string {
    return VERIFIER_URL;
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
    issuers: ContractAddress.Type[];
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
function Statement({ inner, new_statement }: { inner: TopLevelStatements; new_statement: boolean }) {
    const statements = inner.map((outer_statement) => (
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
    if (new_statement) {
        return (
            <>
                {' '}
                {statements} <div className="alert alert-warning"> New credential statement started </div>{' '}
            </>
        );
    } else {
        return <> {statements} </>;
    }
}

interface RevealAttributeProps {
    setStatement: (ns: AtomicStatementV2[]) => void;
    attributeOptions: { value: string; label: string }[];
}

async function submitProof(
    statement: CredentialStatements,
    provider: WalletProvider,
    setMessages: (updateMessage: (oldMessages: string[]) => string[]) => void
) {
    let proof: VerifiablePresentation;
    const challengeBuffer = new Uint8Array(32);
    crypto.getRandomValues(challengeBuffer);
    const challenge = Buffer.from(challengeBuffer).toString('hex');
    console.log(statement);

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
    console.log(proof.toString());
    console.log(proof);
    const resp = await fetch(`${getVerifierURL()}/v0/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: proof.toString(),
    });
    if (resp.ok) {
        setMessages((oldMessages) => [...oldMessages, 'Proof OK']);
    } else {
        const body = await resp.json();
        setMessages((oldMessages) => [...oldMessages, `Proof not OK: (${resp.status}) ${body}`]);
    }
}

function SubmitProof(
    all_statements: TopLevelStatements,
    provider: WalletProvider | undefined
): [(messages: string[]) => any, React.JSX.Element] {
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

    return [
        setMessages,
        <div>
            <div>
                {provider !== undefined && (
                    <button
                        title="Submit the statement as a verified presentation request to the wallet."
                        onClick={() => submitProof(request, provider, setMessages)}
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
                    {' '}
                    {messages.map((m) => (
                        <li className="alert alert-success"> {m} </li>
                    ))}{' '}
                </ol>
            </div>
        </div>,
    ];
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
    const [lower, setLower] = useState<[string, string | undefined]>(['', undefined]);
    const [upper, setUpper] = useState<[string, string | undefined]>(['', undefined]);

    const [selected, setSelected] = useState<[string, string | undefined]>([
        attributeOptions[0].value,
        attributeOptions[0].label,
    ]);

    const handleChange = (option: { value: string; label: string; type: string | undefined } | null) => {
        if (option === null) {
            return;
        }
        setSelected([option.label, option.type]);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        let lower_bound: string | bigint | TimestampAttribute = lower[0];
        if (lower[1] === 'number' || lower[1] === 'integer') {
            lower_bound = BigInt(lower[0]);
        } else if (lower[1] == 'date-time') {
            lower_bound = {
                type: 'date-time',
                timestamp: lower[0],
            };
        }
        let upper_bound: string | bigint | TimestampAttribute = upper[0];
        if (upper[1] === 'number' || upper[1] === 'integer') {
            upper_bound = BigInt(upper[0]);
        } else if (upper[1] == 'date-time') {
            upper_bound = {
                type: 'date-time',
                timestamp: upper[0],
            };
        }
        setStatement([
            {
                type: StatementTypes.AttributeInRange,
                attributeTag: selected[0],
                lower: lower_bound,
                upper: upper_bound,
            },
        ]);
    };

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower([e.target.value, selected[1]]);
    };

    const onUpperChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setUpper([e.target.value, selected[1]]);
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
                <input className="my-1" onChange={onLowerChange} value={lower[0]} />
                <br />
                {'Upper bound: '}
                <input className="my-1" onChange={onUpperChange} value={upper[0]} />
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

    const [selected, setSelected] = useState<[string, string | undefined]>([
        attributeOptions[0].value,
        attributeOptions[0].type,
    ]);

    const handleChange = (option: { value: string; label: string; type: string | undefined } | null) => {
        if (option === null) {
            return;
        }
        setSelected([option.label, option.type]);
    };

    let proof_set: string[] | bigint[] | TimestampAttribute[] = set.split(',').map((s) => s.trim());
    if (selected[1] === 'number' || selected[1] === 'integer') {
        proof_set = proof_set.map((x) => BigInt(x));
    } else if (selected[1] == 'date-time') {
        proof_set = proof_set.map((x) => {
            return {
                type: 'date-time',
                timestamp: x.trim(),
            };
        });
    }

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: member ? StatementTypes.AttributeInSet : StatementTypes.AttributeNotInSet,
                attributeTag: selected[0],
                set: proof_set,
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
                    const ci = await client.getInstanceInfo(ContractAddress.create(addr.index, addr.subindex));
                    const name = ContractName.fromInitName(ci.name);
                    const response = await client.invokeContract({
                        contract: ContractAddress.create(issuers[i], 0),
                        method: ReceiveName.create(name, EntrypointName.fromString('registryMetadata')),
                    });
                    switch (response.tag) {
                        case 'failure':
                            console.log(`Failed to get registry metadata for ${issuers[i]}`);
                            continue;
                        case 'success':
                            const metadata = deserializeTypeValue(
                                response.returnValue!.buffer,
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
                                            let { type } = v as { type: string };
                                            if (type === 'object') {
                                                type = (v as { properties: { type: { const: string } } }).properties
                                                    .type.const;
                                            }

                                            return [
                                                {
                                                    value: (v as { title: string }).title,
                                                    label: tag,
                                                    type,
                                                },
                                                ...oldTags,
                                            ];
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

    const client = useRef(new ConcordiumGRPCClient(new GrpcWebFetchTransport(GRPC_WEB_CONFIG)));

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

    const [lastAccount, setLastAccount] = useState<boolean>(true);

    const [new_statement, setNewStatement] = useState<boolean>(true);

    const addAccountStatement = (a: AtomicStatementV2[]) => {
        setStatement((statements) => {
            if (!lastAccount || new_statement || statements.length == 0) {
                setLastAccount(true);
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
            if (lastAccount || new_statement || statements.length == 0) {
                setLastAccount(false);
                setNewStatement(false);
                const statement: Web3IdStatement = {
                    issuers: parseIssuers(issuers).map((i) => {
                        return ContractAddress.create(i, 0);
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

    const [setMessages, submitProofDisplay] = SubmitProof(statement, provider);

    return (
        <main className="container">
            <nav className="navbar bg-black mb-3 justify-content-between">
                <div className="container-fluid">
                    <a className="navbar-brand text-white" href="#">
                        {`Proof explorer ${version} `}
                    </a>
                    <a
                        className="navbar-text link-primary"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://github.com/Concordium/concordium-web3id/tree/main/test-tools/proof-explorer`}
                    >
                        (source code)
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
                        <p> List of allowed issuers, e.g., 5916,5830 </p>
                        <input
                            className="my-1"
                            placeholder="5916,5830"
                            onChange={onIssuersChange}
                            value={issuers.toString()}
                        />
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
                    <div className="row">
                        <div className="col-6">
                            <button
                                className="btn btn-primary me-1"
                                onClick={async () => connectProvider(await BrowserWalletProvider.getInstance())}
                            >
                                Connect browser
                            </button>
                            <button
                                className="btn btn-secondary mt-2"
                                onClick={async () => connectProvider(await WalletConnectProvider.getInstance())}
                            >
                                Connect mobile
                            </button>
                        </div>
                        {provider !== undefined && <div className="col-4 bg-info p-2 text-center"> Connected </div>}
                        {provider === undefined && (
                            <div className="col-4 bg-danger p-2 text-center"> Not connected </div>
                        )}
                    </div>
                    <hr />
                    <div className="row">
                        <div className="col-sm">
                            {' '}
                            <button
                                title="Start creating a new statement about a potentially different credential."
                                onClick={handleAddTopLevel}
                                type="button"
                                className="btn btn-primary me-1 mt-1"
                            >
                                {'Start a new credential statement'}
                            </button>{' '}
                        </div>

                        <div className="col-sm">
                            {' '}
                            <button
                                title="Delete the last credential statement."
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
                                {'Clear last credential statement'}
                            </button>{' '}
                        </div>
                    </div>
                    <hr />

                    <button
                        title="Clear the list of responses from the wallet and the verifier."
                        onClick={() => setMessages([])}
                        type="button"
                        className="btn btn-primary mt-1"
                    >
                        {'Clear messages.'}
                    </button>

                    <hr />

                    {submitProofDisplay}

                    <hr />
                    <Statement inner={statement} new_statement={new_statement} />
                </div>
                <br />
                <br />
            </div>
        </main>
    );
}
