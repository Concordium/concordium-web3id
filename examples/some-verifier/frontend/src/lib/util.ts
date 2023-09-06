import {
  AttributeKeyString,
  VerifiablePresentation,
  Web3StatementBuilder,
} from '@concordium/web-sdk';
import { Issuer } from './types';
import {
  WalletApi,
  detectConcordiumProvider,
} from '@concordium/browser-wallet-api-helpers';

/**
 * Connects concordium wallet
 *
 * @throws If wallet connection is rejected
 * @throws If wallet could not be found
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
      throw new Error('Wallet not found');
    }

    throw new Error('Wallet connection rejected by user');
  }
}

export async function hash(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

interface ProofOptions {
  /** Whether request user to reveal name of selected identity. Defaults to false */
  revealName?: boolean;
  /** Whether request user to reveal its username for each platform. Defaults to false */
  revealUsername?: boolean;
}

export async function requestProof(
  walletApi: WalletApi,
  issuers: Issuer[],
  challenge: string,
  { revealName = false, revealUsername = false }: ProofOptions = {},
): Promise<VerifiablePresentation> {
  let builder = new Web3StatementBuilder();

  for (const issuer of issuers) {
    builder = builder.addForVerifiableCredentials(
      [
        {
          index: BigInt(issuer.index),
          subindex: BigInt(issuer.subindex),
        },
      ],
      (b) => {
        b.revealAttribute('userId');

        if (!revealUsername) {
          return b;
        }

        return b.revealAttribute('username');
      },
    );
  }

  if (revealName) {
    builder = builder.addForIdentityCredentials([0, 1, 3], (b) =>
      b
        .revealAttribute(AttributeKeyString.firstName)
        .revealAttribute(AttributeKeyString.lastName),
    );
  }

  const statements = builder.getStatements();

  return await walletApi.requestVerifiablePresentation(challenge, statements);
}
