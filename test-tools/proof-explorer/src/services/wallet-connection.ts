import { detectConcordiumProvider, WalletApi } from '@concordium/browser-wallet-api-helpers';
import { CredentialStatements, HexString, VerifiablePresentation, VerifiablePresentationV1, VerificationRequestV1 } from '@concordium/web-sdk';
import { SessionTypes, SignClientTypes } from '@walletconnect/types';
import SignClient from '@walletconnect/sign-client';
import QRCodeModal from '@walletconnect/qrcode-modal';
import EventEmitter from 'events';
import JSONBigInt from 'json-bigint';
import { AccountTransactionType } from '@concordium/web-sdk';
import { RegisterDataPayload } from '@concordium/web-sdk';
import { CHAIN_ID, ID_METHOD, ID_METHOD_V1, WALLET_CONNECT_PROJECT_ID, WALLET_CONNECT_SESSION_NAMESPACE } from '../constants';

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
            super.onAccountChanged(account)
        });
        provider.on('accountDisconnected', async () => {
            const newAccount = (await provider.getMostRecentlySelectedAccount()) ?? undefined;
            super.onAccountChanged(newAccount)
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
        console.log('BrowserWalletProvider: provider.requestAccounts, connecting to wallet...');
        const accounts = await this.provider.requestAccounts();
        console.log('BrowserWalletProvider: connected accounts:', accounts);
        this.connectedAccount = accounts[0];
        return accounts
    }

    async requestVerifiablePresentation(
        challenge: HexString,
        statement: CredentialStatements
    ): Promise<VerifiablePresentation> {
        console.log('BrowserWalletProvider: requesting verifiable presentation with statement:', statement);
        console.log('BrowserWalletProvider: requesting verifiable presentation with challenge:', challenge);
        const result = this.provider.requestVerifiablePresentation(challenge, statement);
        console.log('BrowserWalletProvider: received verifiable presentation.', result);
        return result;
    }

    async sendRegisterDataTransaction(
        payload: RegisterDataPayload
    ): Promise<string> {
        if (this.connectedAccount) {
            return this.provider.sendTransaction(this.connectedAccount, AccountTransactionType.RegisterData, payload);
        } else {
            throw new Error("No connected account to send transaction.")
        }
    }
}

let walletConnectInstance: WalletConnectProvider | undefined;

export class WalletConnectProvider extends WalletProvider {
    private topic: string | undefined;

    constructor(private client: SignClient) {
        super();

        this.client.on('session_update', ({ params }) => {
            super.onAccountChanged(this.getAccount(params.namespaces));
        });

        this.client.on("session_delete", () => {
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

    async connect(methods: string[]): Promise<string[] | undefined> {
        const { uri, approval } = await this.client.connect({
            optionalNamespaces: {
                [WALLET_CONNECT_SESSION_NAMESPACE]: {
                    methods: methods,
                    chains: [CHAIN_ID],
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
            throw new Error("No connected account to send transaction.")
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

    async requestVerifiablePresentationV1(
        request: VerificationRequestV1.Type,
    ): Promise<VerifiablePresentationV1.Type> {
        if (!this.topic) {
            throw new Error('No connection');
        }
        if (!this.connectedAccount) {
            throw new Error("No connected account to send transaction.")
        }

        console.log('WalletConnectProvider: requesting verifiable presentation V1 with params:', request);

        try {
            const result = await this.client.request<{ verifiablePresentationJson: VerifiablePresentationV1.JSON }>({
                topic: this.topic,
                request: {
                    method: ID_METHOD_V1,
                    params: request,
                },
                chainId: CHAIN_ID,
            });
            console.log(result)

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
