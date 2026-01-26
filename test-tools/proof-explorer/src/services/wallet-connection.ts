import EventEmitter from 'events';
import JSONBigInt from 'json-bigint';

import { SessionTypes, SignClientTypes } from '@walletconnect/types';
import SignClient from '@walletconnect/sign-client';
import QRCodeModal from '@walletconnect/qrcode-modal';
import { detectConcordiumProvider, WalletApi } from '@concordium/browser-wallet-api-helpers';
import { AccountTransactionType, RegisterDataPayload } from '@concordium/web-sdk';
import {
    CredentialStatements,
    HexString,
    VerifiablePresentation,
    VerifiablePresentationV1,
    VerificationRequestV1,
} from '@concordium/web-sdk';

import {
    CHAIN_ID,
    CHAIN_ID_OLD,
    REQUEST_VERIFIABLE_PRESENTATION_METHOD,
    REQUEST_VERIFIABLE_PRESENTATION_V1_METHOD,
    WALLET_CONNECT_PROJECT_ID,
    WALLET_CONNECT_SESSION_NAMESPACE,
} from '../constants';

const walletConnectOpts: SignClientTypes.Options = {
    projectId: WALLET_CONNECT_PROJECT_ID,
    metadata: {
        name: 'Proof explorer',
        description: 'Application for testing ID proofs',
        url: '#',
        icons: ['https://walletconnect.com/walletconnect-logo.png'],
    },
};

export abstract class WalletProvider extends EventEmitter {
    connectedAccount: string | undefined;

    abstract requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation>;

    disconnect?(): Promise<void>;

    /**
     * @param account string when account is changed, undefined when disconnected
     */
    protected onAccountChanged(account: string | undefined) {
        this.connectedAccount = account;
        this.emit('accountChanged', account);
    }
}

interface WalletConnectError {
    code: number;
    message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWalletConnectError(obj: any): obj is WalletConnectError {
    return 'code' in obj && 'message' in obj;
}

let browserWalletInstance: BrowserWalletProvider | undefined;

export class BrowserWalletProvider extends WalletProvider {
    constructor(private provider: WalletApi) {
        super();

        provider.on('accountChanged', (account) => {
            super.onAccountChanged(account);
        });
        provider.on('accountDisconnected', async () => {
            const newAccount = (await provider.getMostRecentlySelectedAccount()) ?? undefined;
            super.onAccountChanged(newAccount);
        });
    }
    /**
     * @description gets a singleton instance, allowing existing session to be restored.
     */
    static async getInstance() {
        if (browserWalletInstance === undefined) {
            const provider = await detectConcordiumProvider();
            browserWalletInstance = new BrowserWalletProvider(provider);
        }

        return browserWalletInstance;
    }

    async connect(): Promise<string[] | undefined> {
        const accounts = await this.provider.requestAccounts();
        this.connectedAccount = accounts[0];
        return accounts;
    }

    async requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation> {
        return this.provider.requestVerifiablePresentation(challenge, statement);
    }

    async sendRegisterDataTransaction(payload: RegisterDataPayload): Promise<string> {
        if (this.connectedAccount) {
            return this.provider.sendTransaction(this.connectedAccount, AccountTransactionType.RegisterData, payload);
        } else {
            throw new Error('No connected account to send transaction.');
        }
    }
}

let walletConnectInstance: WalletConnectProvider | undefined;

export class WalletConnectProvider extends WalletProvider {
    private topic: string | undefined;
    // Gets replaced with the old  or new  `CHAIN_ID`
    // from the `constants.ts` file when the connection to the wallet gets established.
    private chainID: string = CHAIN_ID;

    constructor(private client: SignClient) {
        super();

        this.client.on('session_update', ({ params }) => {
            super.onAccountChanged(this.getAccount(params.namespaces));
        });

        this.client.on('session_delete', () => {
            this.topic = undefined;
            super.onAccountChanged(undefined);
        });
    }

    /**
     * @description gets a singleton instance, allowing existing session to be restored.
     */
    static async getInstance() {
        if (walletConnectInstance === undefined) {
            const client = await SignClient.init(walletConnectOpts);
            walletConnectInstance = new WalletConnectProvider(client);
        }

        return walletConnectInstance;
    }

    async connect(methods: string[], useOldWalletConnectConstants: boolean): Promise<string[] | undefined> {
        const chainID = useOldWalletConnectConstants ? CHAIN_ID_OLD : CHAIN_ID;
        this.chainID = chainID;

        const { uri, approval } = await this.client.connect({
            optionalNamespaces: {
                [WALLET_CONNECT_SESSION_NAMESPACE]: {
                    methods: methods,
                    chains: [this.chainID],
                    events: ['accounts_changed'],
                },
            },
        });

        // Connecting to an existing pairing; it can be assumed that the account is already available.
        if (!uri) {
            if (this.connectedAccount == undefined) {
                return undefined;
            } else {
                return [this.connectedAccount];
            }
        }

        // Open QRCode modal if a URI was returned (i.e. we're not connecting an existing pairing).
        QRCodeModal.open(uri, undefined);

        // Await session approval from the wallet.
        const session = await approval();

        this.connectedAccount = this.getAccount(session.namespaces);
        this.topic = session.topic;
        console.log('WalletConnectProvider: connected account:', this.connectedAccount);
        console.log('WalletConnectProvider: session topic:', this.topic);

        // Close the QRCode modal in case it was open.
        QRCodeModal.close();

        if (this.connectedAccount == undefined) {
            return undefined;
        } else {
            return [this.connectedAccount];
        }
    }

    async requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation> {
        if (!this.topic) {
            throw new Error('No connection');
        }
        if (!this.connectedAccount) {
            throw new Error('No connected account to send transaction.');
        }

        const params = {
            challenge,
            credentialStatements: statement,
        };

        const serializedParams = JSONBigInt.stringify(params);
        console.log('WalletConnectProvider: requesting verifiable presentation with params:', serializedParams);

        try {
            const result = await this.client.request<{ verifiablePresentationJson: string }>({
                topic: this.topic,
                request: {
                    method: REQUEST_VERIFIABLE_PRESENTATION_METHOD,
                    params: { paramsJson: serializedParams },
                },
                chainId: this.chainID,
            });
            return VerifiablePresentation.fromString(result.verifiablePresentationJson);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (isWalletConnectError(e)) {
                throw new Error('Proof request rejected in wallet');
            }
            throw e;
        }
    }

    async requestVerifiablePresentationV1(request: VerificationRequestV1.Type): Promise<VerifiablePresentationV1.Type> {
        if (!this.topic) {
            throw new Error('No connection');
        }
        if (!this.connectedAccount) {
            throw new Error('No connected account to send transaction.');
        }

        console.log(
            'WalletConnectProvider: requesting verifiable presentation V1 with request: ',
            JSON.stringify(request)
        );
        try {
            const result = await this.client.request<{ verifiablePresentationJson: VerifiablePresentationV1.JSON }>({
                topic: this.topic,
                request: {
                    method: REQUEST_VERIFIABLE_PRESENTATION_V1_METHOD,
                    params: request,
                },
                chainId: this.chainID,
            });
            return VerifiablePresentationV1.fromJSON(result.verifiablePresentationJson);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (isWalletConnectError(e)) {
                throw new Error('Proof request rejected in wallet');
            }
            throw e;
        }
    }

    async disconnect(): Promise<void> {
        if (this.topic === undefined) {
            return;
        }

        await this.client.disconnect({
            topic: this.topic,
            reason: {
                code: 1,
                message: 'user disconnecting',
            },
        });

        this.connectedAccount = undefined;
        this.topic = undefined;

        super.onAccountChanged(this.connectedAccount);
    }

    private getAccount(ns: SessionTypes.Namespaces): string | undefined {
        const [, , account] = ns[WALLET_CONNECT_SESSION_NAMESPACE].accounts[0].split(':');
        return account;
    }
}
