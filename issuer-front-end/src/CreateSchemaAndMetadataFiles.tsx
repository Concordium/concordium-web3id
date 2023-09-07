/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useState, ChangeEvent, PropsWithChildren, useCallback } from 'react';
import { saveAs } from 'file-saver';

import {
    EXAMPLE_CREDENTIAL_SCHEMA_OBJECT,
    EXAMPLE_ISSUER_METADATA_OBJECT,
    EXAMPLE_CREDENTIAL_METADATA_OBJECT,
} from './constants';

type CredentialSchema = {
    name: string;
    description: string;
    $id: string;
    $schema: string;
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

    credentialSchema.properties.credentialSubject.properties.attributes.properties = [
        ...attributes,
        newAttribute,
    ].reduce(function arrayToObject(result, item) {
        const key = Object.keys(item)[0];
        result[key] = item[key];
        return result;
    }, {});

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
    const [backgroundImage, setBackgroundImage] = useState<undefined | string>(undefined);
    const [logo, setLogo] = useState('https://avatars.githubusercontent.com/u/39614219?s=200&v=4');
    const [title, setTitle] = useState('Example Title');

    const [iconURL, setIconURL] = useState('https://concordium.com/wp-content/uploads/2022/07/Concordium-1.png');
    const [URL, setURL] = useState('https://concordium.com');
    const [issuerDescription, setIssuerDescription] = useState('A public-layer 1, science-backed blockchain');
    const [issuerName, setIssuerName] = useState('Concordium');
    const [id, setId] = useState(
        'https://example-university.com/certificates/JsonSchema2023-education-certificate.json'
    );

    const [attributeTitle, setAttributeTitle] = useState<string | undefined>(undefined);
    const [attributeDescription, setAttributeDescription] = useState<string | undefined>(undefined);

    const [attributeType, setAttributeType] = useState<string>();
    const [required, setRequired] = useState(false);

    const [showCredentialSchema, setShowCredentialSchema] = useState(false);
    const [showCredentialMetadata, setShowCredentialMetadata] = useState(false);
    const [showIssuerMetadata, setShowIssuerMetadata] = useState(false);

    const [userInputErrorAttributes, setUserInputErrorAttributes] = useState('');

    const changeDropDownHandler = (event: ChangeEvent) => {
        const element = event.target as HTMLSelectElement;
        const { value } = element;

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

    const changeId = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setId(target.value);
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

    const changeBackgroundImage = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setBackgroundImage(target.value);

        const newCredentialMetadata = credentialMetadata;
        newCredentialMetadata.image = target.value ? { url: target.value } : undefined;
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
                <div>
                    <h3>CredentialSchema</h3>
                    <p>
                        The <strong> credentialSchema </strong> is a JSON schema describing the credential. The schema
                        must be hosted at a public URL so that it is accessible to the wallet, which uses it, among
                        other things, to render credentials.
                    </p>

                    <p>
                        The schema consists of some metadata (name of the credential and description) together with a
                        number of attributes. The form below supports inputting the necessary data and generating the
                        JSON schema in the correct format.
                    </p>
                </div>
                <br />
                <br />
                <label htmlFor="credentialName">Credential name</label>
                <input
                    className="inputFieldStyle"
                    id="credentialName"
                    type="text"
                    value={credentialName}
                    onChange={changeCredentialName}
                />
                <br />
                <br />
                <label htmlFor="credentialDescription">Credential description</label>
                <input
                    className="inputFieldStyle"
                    id="credentialDescription"
                    type="text"
                    value={credentialDescription}
                    onChange={changeCredentialDescription}
                />
                <br />
                <br />
                <div>
                    <p> The ID should be the URL where this schema will be hosted on the web. </p>
                </div>
                <br />

                <label htmlFor="id">ID</label>
                <input className="inputFieldStyle" id="id" type="text" value={id} onChange={changeId} />
                <TestBox>
                    <label htmlFor="attributeTitle">Attribute title</label>
                    <input
                        className="inputFieldStyle"
                        id="attributeTitle"
                        type="text"
                        value={attributeTitle}
                        onChange={changeAttributeTitle}
                    />
                    <br />
                    <br />
                    <label htmlFor="attributeDescription">Attribute Description</label>
                    <input
                        className="inputFieldStyle"
                        id="attributeDescription"
                        type="text"
                        value={attributeDescription}
                        onChange={changeAttributeDescription}
                    />
                    <br />
                    <br />
                    <label className="field">
                        Select type:
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
                    <label htmlFor="checkBox">&nbsp;Attribute is required:&nbsp;</label>
                    <input
                        type="checkbox"
                        id="checkBox"
                        name="checkBox"
                        onChange={(event) => changeCheckBox(required, event)}
                    />
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
                            setUserInputErrorAttributes('');

                            credentialSchema.properties.credentialSubject.properties.attributes.required = [];
                            credentialSchema.properties.credentialSubject.properties.attributes.properties = {};
                        }}
                    >
                        Clear All Attributes
                    </button>
                    <br />
                    {attributes.length !== 0 && (
                        <>
                            <br />
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
                            <div className="actionResultBox">
                                {credentialSchema.properties.credentialSubject.properties.attributes.required.length ===
                                    0 && <div>No required attribues.</div>}
                                {credentialSchema.properties.credentialSubject.properties.attributes.required.length !==
                                    0 && (
                                    <>
                                        <div>Required attributes:</div>
                                        <div>
                                            {credentialSchema.properties.credentialSubject.properties.attributes.required?.map(
                                                (element) => (
                                                    <li key={element}>{element}</li>
                                                )
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
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

                        const fileToSave = new Blob([JSON.stringify(credentialSchema, null, 2)], {
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
                <div>
                    <h3>CredentialMetadata</h3>
                    <p>
                        The credential metadata describes the details of a single credential, such as logo, background
                        image or color, and localization. Like the JSON schema, the credential metadata must be hosted
                        at a public URL and will also be used by the wallet to style the credential.
                    </p>
                </div>
                <label htmlFor="title">Title</label>
                <input className="inputFieldStyle" id="title" type="text" value={title} onChange={changeTitle} />
                <br />
                <br />
                <label htmlFor="logoURL">Logo URL</label>
                <input className="inputFieldStyle" id="logoURL" type="text" value={logo} onChange={changeLogoURL} />
                <br />
                <br />
                <label htmlFor="backgroundColor">Background color</label>
                <input
                    className="inputFieldStyle"
                    id="backgroundColor"
                    type="text"
                    value={backgroundColor}
                    onChange={changeBackgroundColor}
                />
                <br />
                <br />
                <label htmlFor="backgroundImage">Background image (optional)</label>
                <input
                    className="inputFieldStyle"
                    id="backgroundImage"
                    type="text"
                    value={backgroundImage !== undefined ? backgroundImage : ''}
                    onChange={changeBackgroundImage}
                />
                <br />
                <br />
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

                        const fileToSave = new Blob([JSON.stringify(credentialMetadata, null, 2)], {
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
                <div>
                    <h3>IssuerMetadata</h3>
                    <p>
                        The issuerMetadata is a JSON object describing the <strong>issuer</strong>, compared to the
                        credential. It allows for styling of the issuer.
                    </p>
                </div>
                <br />
                <br />
                <label htmlFor="issuerName">Issuer name</label>
                <input
                    className="inputFieldStyle"
                    id="issuerName"
                    type="text"
                    value={issuerName}
                    onChange={changeIssuerName}
                />
                <br />
                <br />
                <label htmlFor="issuerDescription">Issuer description</label>
                <input
                    className="inputFieldStyle"
                    id="issuerDescription"
                    type="text"
                    value={issuerDescription}
                    onChange={changeIssuerDescription}
                />
                <br />
                <br />
                <label htmlFor="URL">Issuer URL</label>
                <input className="inputFieldStyle" id="URL" type="text" value={URL} onChange={changeURL} />
                <br />
                <br />
                <label htmlFor="iconURL">Issuer icon URL</label>
                <input className="inputFieldStyle" id="iconURL" type="text" value={iconURL} onChange={changeIconURL} />
                <br />
                <br />
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

                        const fileToSave = new Blob([JSON.stringify(issuerMetadata, null, 2)], {
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
