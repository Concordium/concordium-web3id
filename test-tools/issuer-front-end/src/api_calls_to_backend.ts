import { BACKEND_API } from './constants';

export async function requestIssuerKeys(seed: string) {
    if (seed === '') {
        throw new Error('Insert a seed in step 1.');
    }

    const response = await fetch(`${BACKEND_API}/v0/key/${seed}`, {
        method: 'GET',
        headers: new Headers({ 'content-type': 'application/json' }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Unable to get issuer keys: ${JSON.stringify(error)}`);
    }
    const body = await response.json();
    if (body) {
        return body;
    }
    throw new Error('Unable to get issuer keys');
}

export async function requestSignature(seed: string, credentialCommitments: string) {
    if (seed === '') {
        throw new Error('Insert a seed in step 1.');
    }

    if (credentialCommitments === '') {
        throw new Error('Insert the `credentialCommitments`.');
    }

    const response = await fetch(`${BACKEND_API}/v0/commitments/${seed}`, {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),

        body: credentialCommitments,
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Unable to get signature on credential commitments: ${JSON.stringify(error)}`);
    }
    const body = await response.json();
    if (body) {
        return body;
    }
    throw new Error('Unable to get signature on credential commitments');
}
