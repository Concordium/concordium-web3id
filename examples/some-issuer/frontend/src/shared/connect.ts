import { WalletApi, detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';

export enum ConnectionErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    REJECTED = 'REJECTED',
}

export class ConnectionError extends Error {
    constructor(
        public code: ConnectionErrorCode,
        message: string
    ) {
        super(message);
    }

    static notFound(): ConnectionError {
        return new ConnectionError(ConnectionErrorCode.NOT_FOUND, 'Wallet not found');
    }

    static rejected(): ConnectionError {
        return new ConnectionError(ConnectionErrorCode.REJECTED, 'Wallet connection rejected by user');
    }
}

/**
 * Connects concordium wallet
 *
 * @throws A {@link ConnectionError} with code `ConnectionErrorCode.REJECTED` if wallet connection is rejected
 * @throws A {@link ConnectionError} with code `ConnectionErrorCode.NOT_FOUND` if wallet could not be found
 *
 * @returns {WalletApi} The wallet API
 */
export async function connectWallet(): Promise<WalletApi> {
    try {
        const api = await detectConcordiumProvider(0); // Throws `undefined` if not found...
        await api.requestAccounts(); // This will throw an `Error` if user rejects.
        return api;
    } catch (e) {
        if (e === undefined) {
            // Concordium provider not available.
            throw ConnectionError.notFound();
        }

        throw ConnectionError.rejected();
    }
}
