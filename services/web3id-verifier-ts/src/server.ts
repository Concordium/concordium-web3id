import express, { NextFunction, Request, Response } from 'express';
import { AppConfig } from './types.js';
import { VerifiablePresentation } from '@concordium/web-sdk/types';
import { ConcordiumGRPCNodeClient, credentials } from '@concordium/web-sdk/nodejs';
import { getPublicData } from '@concordium/web-sdk/web3-id';
import { CIS4 } from '@concordium/web-sdk/cis4';
import { verifyPresentation } from '@concordium/web-sdk/wasm';

class HttpError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
    }

    static fromThrowable(e: unknown, statusCode: number) {
        let message: string = 'An error happened while handling the request';
        if (e instanceof Error) {
            message = e.message;
        } else if (typeof e === 'string') {
            message = e;
        }

        const error = new HttpError(statusCode, message);
        if (e instanceof Error) {
            error.stack = e.stack;
        }

        return error;
    }
}

function httpErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
    if (err instanceof Error) {
        console.error(err.message, err.stack);
    } else {
        console.error(err);
    }

    if (err instanceof HttpError) {
        res.status(err.statusCode).send(err.message);
    } else {
        next(err);
    }
}

/**
 * Create a new ConcordiumGRPCNodeClient with the provided endpoint.
 * */
function setupConcordiumClient(endpoint: URL, timeout: number): ConcordiumGRPCNodeClient {
    // FIXME: support https
    let addr = endpoint.hostname;
    let port = Number(endpoint.port);
    return new ConcordiumGRPCNodeClient(addr, port, credentials.createInsecure(), { timeout: timeout });
}

export function runServer(appConfig: AppConfig) {
    const app = express();
    app.use(httpErrorHandler);

    const grpc = setupConcordiumClient(appConfig.endpoint, appConfig.requestTimeout);

    async function verify(req: Request, res: Response) {
        // Parse the JSON body as a VerifiablePresentation.
        // Catch the error if the body is not a valid VerifiablePresentation.
        const vp = VerifiablePresentation.fromString(req.body);
        console.log('Verifiable presentation:', vp.toString());

        // Get the block info from the node.
        const { blockHash, blockSlotTime: blockTime } = await grpc.getBlockInfo();
        const publicData = await getPublicData(grpc, appConfig.network, vp, blockHash);

        // Check that all credentials are currently active
        publicData.forEach((data) => {
            if (data.status !== CIS4.CredentialStatus.Active) {
                throw new Error('One or more credentials in the presentation are inactive');
            }
        });

        const globalContext = await grpc.getCryptographicParameters(blockHash);
        try {
            // TODO: define correct type
            const verifiedRequest: any = verifyPresentation(
                vp,
                globalContext,
                publicData.map((d) => d.inputs),
            );

            res.send({
                blockHash,
                blockTime,
                ...verifiedRequest, // flatten fields of verified request into response body.
            });
        } catch (e: unknown) {
            throw HttpError.fromThrowable(e, 400);
        }
    }

    // Define the routes, where /v0/verify is handled by the function verify_presentation.
    app.post('/v0/verify', verify);

    // Start the server
    app.listen(appConfig.listenAddress.port, () => {
        // Log all the configuration settings in a nice format.
        console.log('Configuration:', JSON.stringify(appConfig, null, 2));
        console.log(`Server is running on ${appConfig.listenAddress} (port: ${appConfig.listenAddress.port})`);
    });
}
