/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

import { saveAs } from 'file-saver';

import { Accordion, Alert, Button, Form, Modal, Row } from 'react-bootstrap';
import AccordionItem from 'react-bootstrap/esm/AccordionItem';
import AccordionHeader from 'react-bootstrap/esm/AccordionHeader';
import AccordionBody from 'react-bootstrap/esm/AccordionBody';
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

async function addAttribute(
    attributes: object[],
    setAttributes: (value: object[]) => void,
    attributeTitle: string,
    attributeDescription: string,
    isRequired: boolean,
    type: string,
    credentialSchema: CredentialSchema
) {
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
    const [credentialSchema] = useState(EXAMPLE_CREDENTIAL_SCHEMA_OBJECT);
    const [credentialMetadata, setCredentialMetadata] = useState(EXAMPLE_CREDENTIAL_METADATA_OBJECT);
    const [issuerMetadata, setIssuerMetadata] = useState(EXAMPLE_ISSUER_METADATA_OBJECT);
    const issuerMetadataForm = useForm<typeof EXAMPLE_ISSUER_METADATA_OBJECT>();
    const credentialMetadataForm = useForm<typeof EXAMPLE_CREDENTIAL_METADATA_OBJECT>();
    const credentialSchemaForm = useForm<typeof EXAMPLE_CREDENTIAL_SCHEMA_OBJECT>();
    const attributeForm = useForm<{
        title: string;
        description: string;
        type: 'integer' | 'string' | 'date-time';
        required: boolean;
    }>();
    const [attributes, setAttributes] = useState<object[]>([]);

    const [showCredentialSchema, setShowCredentialSchema] = useState(false);
    const [showCredentialMetadata, setShowCredentialMetadata] = useState(false);
    const [showIssuerMetadata, setShowIssuerMetadata] = useState(false);

    const [show, setShow] = useState(false);

    const handleClose = () => setShow(false);

    return (
        <>
            <Modal show={show}>
                <Modal.Dialog>
                    <Modal.Header closeButton>
                        <Modal.Title>Duplicate attribute tags.</Modal.Title>
                    </Modal.Header>

                    <Modal.Body>
                        <p>Cannot have duplicate attribute tags.</p>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={handleClose}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal>
            <Accordion>
                <AccordionItem eventKey="CredentialSchema">
                    <AccordionHeader>CredentialSchema</AccordionHeader>
                    <AccordionBody>
                        <Row>
                            The credentialSchema is a JSON schema describing the credential. The schema must be hosted
                            at a public URL so that it is accessible to the wallet, which uses it, among other things,
                            to render credentials.
                        </Row>
                        <Row>
                            The schema consists of some metadata (name of the credential and description) together with
                            a number of attributes. The form below supports inputting the necessary data and generating
                            the JSON schema in the correct format.
                        </Row>
                        <Form>
                            <Form.Group className="mb-3">
                                <Form.Label>Credential name</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_SCHEMA_OBJECT.name}
                                    {...credentialSchemaForm.register('name', { required: true })}
                                />
                                {credentialSchemaForm.formState.errors.name && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Credential name is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Credential description</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_SCHEMA_OBJECT.description}
                                    {...credentialSchemaForm.register('description', { required: true })}
                                />
                                {credentialSchemaForm.formState.errors.description && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Credential description is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Credential id</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_SCHEMA_OBJECT.$id}
                                    {...credentialSchemaForm.register('$id', { required: true })}
                                />
                                {credentialSchemaForm.formState.errors.$id && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Credential id is required{' '}
                                    </Alert>
                                )}
                                <Form.Text>
                                    The ID should be the URL where this schema will be hosted on the web.
                                </Form.Text>
                            </Form.Group>
                            <Form className="border">
                                <Form.Group className="mb-3">
                                    <Form.Label>Attribute title</Form.Label>
                                    <Form.Control {...attributeForm.register('title', { required: true })} />
                                    <Form.Text />
                                    {attributeForm.formState.errors.title && (
                                        <Alert key="info" variant="info">
                                            {' '}
                                            Attribute title is required{' '}
                                        </Alert>
                                    )}
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label>Attribute description</Form.Label>
                                    <Form.Control {...attributeForm.register('description', { required: true })} />
                                    {attributeForm.formState.errors.description && (
                                        <Alert key="info" variant="info">
                                            {' '}
                                            Attribute description is required{' '}
                                        </Alert>
                                    )}
                                    <Form.Text />
                                </Form.Group>

                                <Form.Group>
                                    <Form.Label>Attribute type</Form.Label>
                                    <Form.Select aria-label="Attribute-type" {...attributeForm.register('type')}>
                                        <option value="string">String</option>
                                        <option value="integer">Integer</option>
                                        <option value="date-time">Date-time</option>
                                    </Form.Select>
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Check
                                        type="checkbox"
                                        id="attribute-required"
                                        label="Attribute is required"
                                        {...attributeForm.register('required')}
                                    />
                                </Form.Group>
                                <Button
                                    variant="primary"
                                    type="button"
                                    onClick={attributeForm.handleSubmit((data) => {
                                        addAttribute(
                                            attributes,
                                            setAttributes,
                                            data.title,
                                            data.description,
                                            data.required,
                                            data.type,
                                            credentialSchema
                                        ).catch((e) => {
                                            alert(e)
                                            setShow(true)
                                        });
                                    })}
                                >
                                    Add attribute
                                </Button>
                                <Button variant="primary" type="button" onClick={() => setAttributes([])}>
                                    Clear attributes
                                </Button>
                            </Form>

                            <Button
                                className="mt-3"
                                variant="primary"
                                type="button"
                                onClick={credentialSchemaForm.handleSubmit(() => {
                                    setShowCredentialSchema(true);
                                })}
                            >
                                Create credential schema
                            </Button>
                            <Button
                                className="mt-3"
                                variant="primary"
                                type="button"
                                onClick={credentialSchemaForm.handleSubmit(() => {
                                    setShowCredentialSchema(true);
                                    const fileName = 'credentialSchema.json';

                                    const fileToSave = new Blob([JSON.stringify(credentialSchema, null, 2)], {
                                        type: 'application/json',
                                    });

                                    saveAs(fileToSave, fileName);
                                })}
                            >
                                Download credential schema
                            </Button>
                        </Form>
                        {attributes.length !== 0 && (
                            <>
                                <div>
                                    <div>
                                        You have added the following <strong>attributes</strong>:
                                    </div>
                                    <div>
                                        <pre>{JSON.stringify(attributes, null, 2)}</pre>
                                    </div>
                                </div>
                                <br />
                                <br />
                                <div>
                                    {credentialSchema.properties.credentialSubject.properties.attributes.required
                                        .length === 0 && <div>No required attribues.</div>}
                                    {credentialSchema.properties.credentialSubject.properties.attributes.required
                                        .length !== 0 && (
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
                        {showCredentialSchema && (
                            <pre className="largeText">{JSON.stringify(credentialSchema, null, 2)}</pre>
                        )}
                    </AccordionBody>
                </AccordionItem>

                <AccordionItem eventKey="CredentialMetadata">
                    <AccordionHeader>CredentialMetadata</AccordionHeader>
                    <AccordionBody>
                        The credential metadata describes the details of a single credential, such as logo, background
                        image or color, and localization. Like the JSON schema, the credential metadata must be hosted
                        at a public URL and will also be used by the wallet to style the credential.
                        <Form>
                            <Form.Group className="mb-3">
                                <Form.Label>Title</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_METADATA_OBJECT.title}
                                    {...credentialMetadataForm.register('title', { required: true })}
                                />
                                {credentialMetadataForm.formState.errors.title && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Title is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Logo URL</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_METADATA_OBJECT.logo.url}
                                    {...credentialMetadataForm.register('logo.url', { required: true })}
                                />
                                {credentialMetadataForm.formState.errors.logo && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Logo URL is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Background color</Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_CREDENTIAL_METADATA_OBJECT.backgroundColor}
                                    {...credentialMetadataForm.register('backgroundColor', { required: true })}
                                />
                                <Form.Text />
                                {credentialMetadataForm.formState.errors.backgroundColor && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Background color is required{' '}
                                    </Alert>
                                )}
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Background image (optional)</Form.Label>
                                <Form.Control {...credentialMetadataForm.register('image.url', { required: false })} />
                                <Form.Text />
                            </Form.Group>
                            <Button
                                variant="primary"
                                type="button"
                                onClick={credentialMetadataForm.handleSubmit((data) => {
                                    if (!data.image?.url) {
                                        data.image = undefined;
                                    }
                                    setCredentialMetadata(data);
                                    setShowCredentialMetadata(true);
                                })}
                            >
                                Create credential metadata
                            </Button>
                            <Button
                                variant="primary"
                                type="button"
                                onClick={credentialMetadataForm.handleSubmit((data) => {
                                    if (!data.image?.url) {
                                        data.image = undefined;
                                    }
                                    setCredentialMetadata(data);
                                    setShowCredentialMetadata(true);

                                    const fileName = 'credentialMetadata.json';

                                    const fileToSave = new Blob([JSON.stringify(credentialMetadata, null, 2)], {
                                        type: 'application/json',
                                    });

                                    saveAs(fileToSave, fileName);
                                })}
                            >
                                Download credential metadata
                            </Button>
                        </Form>
                        {showCredentialMetadata && (
                            <pre className="largeText">{JSON.stringify(credentialMetadata, null, 2)}</pre>
                        )}
                    </AccordionBody>
                </AccordionItem>
                <AccordionItem eventKey="IssuerMetadata">
                    <AccordionHeader>IssuerMetadata</AccordionHeader>
                    <AccordionBody>
                        The issuerMetadata is a JSON object describing the <strong>issuer</strong>, compared to the
                        credential. It allows for styling of the issuer.
                        <Form onSubmit={issuerMetadataForm.handleSubmit((x: any) => x)}>
                            <Form.Group className="mb-3">
                                <Form.Label> Issuer name </Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_ISSUER_METADATA_OBJECT.name}
                                    {...issuerMetadataForm.register('name', { required: true })}
                                />
                                {issuerMetadataForm.formState.errors.name && 'Name is required'}
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label> Issuer description: </Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_ISSUER_METADATA_OBJECT.description}
                                    {...issuerMetadataForm.register('description', { required: true })}
                                />
                                {issuerMetadataForm.formState.errors.description && 'Description is required'}
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label> URL: </Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_ISSUER_METADATA_OBJECT.url}
                                    {...issuerMetadataForm.register('url', { required: true })}
                                />
                                {issuerMetadataForm.formState.errors.url && 'URL is required'}
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label> Icon URL: </Form.Label>
                                <Form.Control
                                    defaultValue={EXAMPLE_ISSUER_METADATA_OBJECT.icon.url}
                                    {...issuerMetadataForm.register('icon.url', { required: true })}
                                />
                                {issuerMetadataForm.formState.errors.icon && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Icon URL is required{' '}
                                    </Alert>
                                )}
                                <Form.Text>
                                    {' '}
                                    The icon URL is used by the wallet to display the issuer to the user.{' '}
                                </Form.Text>
                            </Form.Group>
                            <Button
                                variant="primary"
                                type="button"
                                onClick={issuerMetadataForm.handleSubmit((data) => {
                                    setIssuerMetadata(data);
                                    setShowIssuerMetadata(true);
                                })}
                            >
                                Create issuer metadata
                            </Button>
                            <Button
                                variant="primary"
                                type="button"
                                onClick={issuerMetadataForm.handleSubmit((data) => {
                                    setIssuerMetadata(data);
                                    setShowIssuerMetadata(true);

                                    const fileName = 'issuerMetadata.json';

                                    const fileToSave = new Blob([JSON.stringify(issuerMetadata, null, 2)], {
                                        type: 'application/json',
                                    });

                                    saveAs(fileToSave, fileName);
                                })}
                            >
                                Download issuer metadata
                            </Button>
                        </Form>
                        {showIssuerMetadata && (
                            <pre className="largeText">{JSON.stringify(issuerMetadata, null, 2)}</pre>
                        )}
                    </AccordionBody>
                </AccordionItem>
            </Accordion>
        </>
    );
}
