import { CredentialProof } from '@concordium/browser-wallet-api-helpers';
import { TelegramUser } from 'react-telegram-login';
import { MakeRequired, Platform } from './types';
import { connectWallet } from './connect';

interface IssuerResponse {
  txHash: string;
  credential: {
    proof: CredentialProof;
    randomness: Record<string, string>;
  };
}

interface IssueRequest {
  credential: CredentialInfo;
  telegramUser?: TelegramUser;
}

interface CredentialInfo {
  holderId: string;
  holderRevocable: boolean;
  validFrom: string;
  metadataUrl: {
    url: string;
  };
}

interface TelegramRequest {
  platform: Platform.Telegram;
  user: MakeRequired<TelegramUser, 'username'>;
}

interface DiscordUser {
  id: string;
  username: string;
}

interface DiscordRequest {
  platform: Platform.Discord;
  user: DiscordUser;
}

interface RpcError {
  code: string;
}

const CONTRACT_DID = `$did:ccd:${config.network}:sci:${config.contract.index}:${config.contract.subindex}/issuer`;
const ISSUER_URL = location.href;

export async function requestCredential(
  req: TelegramRequest | DiscordRequest,
  onSubmit: (txHash: string) => void,
  onFinalized: () => void,
) {
  const { id, username } = req.user;

  const credential = {
    $schema: `./JsonSchema2023-${req.platform}.json`,
    type: [
      'VerifiableCredential',
      'ConcordiumVerifiableCredential',
      'SoMeCredential',
    ],
    issuer: CONTRACT_DID,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { attributes: { userId: id.toString(), username } },
    credentialSchema: {
      id: `${ISSUER_URL}json-schemas/JsonSchema2023-${req.platform}.json`,
      type: 'JsonSchema2023',
    },
  };

  const metadataUrl = {
    url: ISSUER_URL + 'json-schemas/credential-metadata.json',
  };

  let txHash: string | undefined;
  const api = await connectWallet();
  await api.addWeb3IdCredential(credential, metadataUrl, async (id) => {
    const parts = id.split(':');
    const holderId = parts[parts.length - 1];

    const body: IssueRequest = {
      credential: {
        holderId,
        holderRevocable: true,
        validFrom: new Date().toISOString(),
        metadataUrl,
      },
    };
    if (req.platform === Platform.Telegram) body.telegramUser = req.user;

    const endpoint = ISSUER_URL + 'credential';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // If we're sending Discord requests, we need to include proof of our user id
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status == 429)
        throw new Error(
          'Sorry, too many credentials have been issued for this account.',
        );
      throw new Error('Error getting credential: ' + (await response.text()));
    }

    const { txHash: hash, credential } =
      (await response.json()) as IssuerResponse;
    txHash = hash;
    const { proof, randomness } = credential;
    return { proof, randomness };
  });

  onSubmit(txHash!);

  // Loop until transaction has been finalized
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await api.getGrpcClient().waitForTransactionFinalization(txHash!);
      onFinalized();
      break;
    } catch (error) {
      // NOT_FOUND errors just mean that the transaction hasn't been propagated yet
      if ((error as RpcError).code !== 'NOT_FOUND') throw error;
      // Sleep for 200ms and try again
      console.log('Transaction not found. Retrying in 200ms...');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
