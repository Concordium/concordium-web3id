/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useState, ChangeEvent, PropsWithChildren, MouseEvent, useCallback } from 'react';
import { saveAs } from 'file-saver';

import {
    EXAMPLE_CREDENTIAL_SCHEMA_OBJECT,
    EXAMPLE_ISSUER_METADATA_OBJECT,
    EXAMPLE_CREDENTIAL_METADATA_OBJECT,
} from './constants';

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

function TestBox({ children }: PropsWithChildren) {
    return (
        <fieldset className="testBox">
            <div className="testBoxFields">{children}</div>
            <br />
        </fieldset>
    );
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

export default function CreateSchemaAndMetadataFiles() {

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

    const [userInputErrorAttributes, setUserInputErrorAttributes] = useState('');

    const display = useCallback((event: MouseEvent<HTMLElement>) => {
        const element = event.target as HTMLTextAreaElement;
        alert(element.parentElement?.title || element.parentElement?.parentElement?.title || element.title);
    }, []);

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

    return (
        <>
            <TestBox>
                <div
                    className="containerToolTip"
                    role="presentation"
                    onClick={display}
                    data-toggle="tooltip"
                    title="The credentialSchema is a JSON object that you will create in this step. You should host this JSON object somewhere publicly on the web so it is available via a URL. You will use the URL in step 4. You can for example host it on your gist account (`https://gist.github.com/`) and click the `raw` button to optain the URL (e.g. `https://gist.githubusercontent.com/DOBEN/bfe30ecea16f7a3ea1b87aa40902b9ac/raw/a8ab51fca489d04710fb19fb7122bb283dba719a/gistfile1.txt`)."
                >
                    <div>
                        <h3>CredentialSchema</h3>
                    </div>
                    <div className="infolink" />
                </div>
                <br />
                <br />
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
                <TestBox>
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
                        <label htmlFor="checkBox">&nbsp;Is Type Required</label>
                    </div>
                    <br />
                    <br />
                    <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                            setUserInputErrorAttributes('');
                            addAttribute(
                                attributes,
                                setAttributes,
                                attributeTitle,
                                attributeDescription,
                                required,
                                attributeType,
                                credentialSchema
                            ).catch((err: Error) => setUserInputErrorAttributes((err as Error).message));
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
                            setUserInputErrorAttributes('');
                        }}
                    >
                        Clear All Attributes
                    </button>
                    <br />
                    {attributes.length !== 0 && (
                        <>
                            <div className="actionResultBox">
                                <div>
                                    You have added the following <strong>attributes</strong>:
                                </div>
                                <div>
                                    <pre className="largeText">{JSON.stringify(attributes, null, '\t')}</pre>
                                </div>
                            </div>
                            <br />
                            <br />
                        </>
                    )}
                    {userInputErrorAttributes !== '' && (
                        <div className="alert alert-danger" role="alert">
                            Error: {userInputErrorAttributes}.
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
                    <pre className="largeText">{JSON.stringify(credentialSchema, null, '\t')}</pre>
                )}
            </TestBox>
            <TestBox>
                <div
                    className="containerToolTip"
                    role="presentation"
                    onClick={display}
                    data-toggle="tooltip"
                    title="The credentialMetadata is a JSON object that you will create in this step. You should host this JSON object somewhere publicly on the web so it is available via a URL. You will use the URL when issuing credentials. You can for example host it on your gist account (`https://gist.github.com/`) and click the `raw` button to optain the URL (e.g. `https://gist.githubusercontent.com/abizjak/ff1e90d82c5446c0e001ee6d4e33ea6b/raw/4528363aff42e3ff36b50a1d873287f2f520d610/metadata.json`)."
                >
                    <div>
                        <h3>CredentialMetadata</h3>
                    </div>
                    <div className="infolink" />
                </div>
                <br />
                <br />
                Add <strong>Title</strong>:
                <br />
                <input className="inputFieldStyle" id="title" type="text" value={title} onChange={changeTitle} />
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
                    <pre className="largeText">{JSON.stringify(credentialMetadata, null, '\t')}</pre>
                )}
            </TestBox>
            <TestBox>
                <div
                    className="containerToolTip"
                    role="presentation"
                    onClick={display}
                    data-toggle="tooltip"
                    title="The issuerMetadata is a JSON object that you will create in this step. You should host this JSON object somewhere publicly on the web so it is available via a URL. You will use the URL in step 4. You can for example host it on your gist account (`https://gist.github.com/`) and click the `raw` button to optain the URL (e.g. `https://gist.githubusercontent.com/DOBEN/d12deee42e06601efb72859da9be5759/raw/137a9a4b9623dfe16fa8e9bb7ab07f5858d92c53/gistfile1.txt`)."
                >
                    <div>
                        <h3>IssuerMetadata</h3>
                    </div>
                    <div className="infolink" />
                </div>
                <br />
                <br />
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
                <input className="inputFieldStyle" id="URL" type="text" value={URL} onChange={changeURL} />
                <br />
                <br />
                Add <strong>IconURL</strong>:
                <br />
                <input className="inputFieldStyle" id="iconURL" type="text" value={iconURL} onChange={changeIconURL} />
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
                {showIssuerMetadata && <pre className="largeText">{JSON.stringify(issuerMetadata, null, '\t')}</pre>}
            </TestBox>
        </>
    );
}
