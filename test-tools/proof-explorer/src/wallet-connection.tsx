import { detectConcordiumProvider, WalletApi } from '@concordium/browser-wallet-api-helpers';
import { CredentialStatements, HexString, VerifiablePresentation } from '@concordium/web-sdk';
import { SessionTypes, SignClientTypes } from '@walletconnect/types';
import SignClient from '@walletconnect/sign-client';
import QRCodeModal from '@walletconnect/qrcode-modal';
import EventEmitter from 'events';
import JSONBigInt from 'json-bigint';

const WALLET_CONNECT_PROJECT_ID = '76324905a70fe5c388bab46d3e0564dc';
const WALLET_CONNECT_SESSION_NAMESPACE = 'ccd';
const CHAIN_ID = `${WALLET_CONNECT_SESSION_NAMESPACE}:testnet`;

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
    abstract connect(): Promise<string[] | undefined>;
    abstract requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation>;
    disconnect?(): Promise<void>;

    /**
     * @param account string when account is changed, undefined when disconnected
     */
    protected onAccountChanged(account: string | undefined) {
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

        provider.on('accountChanged', (account) => super.onAccountChanged(account));
        provider.on('accountDisconnected', async () =>
            super.onAccountChanged((await provider.getMostRecentlySelectedAccount()) ?? undefined)
        );
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
        return this.provider.requestAccounts();
    }

    async requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation> {
        return this.provider.requestVerifiablePresentation(challenge, statement);
    }
}

const ID_METHOD = 'request_verifiable_presentation';

let walletConnectInstance: WalletConnectProvider | undefined;

export class WalletConnectProvider extends WalletProvider {
    private account: string | undefined;
    private topic: string | undefined;

    constructor(private client: SignClient) {
        super();

        this.client.on('session_update', ({ params }) => {
            this.account = this.getAccount(params.namespaces);
            super.onAccountChanged(this.account);
        });

        this.client.on('session_delete', () => {
            this.account = undefined;
            this.topic = undefined;

            super.onAccountChanged(this.account);
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

    async connect(): Promise<string[] | undefined> {
        const { uri, approval } = await this.client.connect({
            requiredNamespaces: {
                [WALLET_CONNECT_SESSION_NAMESPACE]: {
                    methods: [ID_METHOD],
                    chains: [CHAIN_ID],
                    events: ['accounts_changed'],
                },
            },
        });

        // Connecting to an existing pairing; it can be assumed that the account is already available.
        if (!uri) {
            if (this.account == undefined) {
                return undefined;
            } else {
                return [this.account];
            }
        }

        // Open QRCode modal if a URI was returned (i.e. we're not connecting an existing pairing).
        QRCodeModal.open(uri, undefined);

        // Await session approval from the wallet.
        const session = await approval();

        this.account = this.getAccount(session.namespaces);
        this.topic = session.topic;

        // Close the QRCode modal in case it was open.
        QRCodeModal.close();

        if (this.account == undefined) {
            return undefined;
        } else {
            return [this.account];
        }
    }

    async requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation> {
        if (!this.topic) {
            throw new Error('No connection');
        }

        const params = {
            challenge,
            credentialStatements: statement,
        };

        const serializedParams = JSONBigInt.stringify(params);

        try {
            const result = await this.client.request<{ verifiablePresentationJson: string }>({
                topic: this.topic,
                request: {
                    method: ID_METHOD,
                    params: { paramsJson: serializedParams },
                },
                chainId: CHAIN_ID,
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

        this.account = undefined;
        this.topic = undefined;

        super.onAccountChanged(this.account);
    }

    private getAccount(ns: SessionTypes.Namespaces): string | undefined {
        const [, , account] = ns[WALLET_CONNECT_SESSION_NAMESPACE].accounts[0].split(':');
        return account;
    }
}
