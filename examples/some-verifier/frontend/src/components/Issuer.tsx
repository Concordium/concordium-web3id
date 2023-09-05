import {
  CredentialProof,
  detectConcordiumProvider,
} from '@concordium/browser-wallet-api-helpers';
import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import { useEffect, useState } from 'react';
import { DiscordLoginButton } from 'react-social-login-buttons';
import { ListGroup, ListGroupItem, ListGroupItemHeading } from 'reactstrap';
import { nanoid } from 'nanoid';
import { Config, Issuer, Platform } from '../lib/types';
import _config from '../../config.json';
const config = _config as Config;

function getContractDid(issuer: Issuer): string {
  return `$did:ccd:${issuer.chain}:sci:${issuer.index}:${issuer.subindex}/issuer`;
}

declare type NotOptional<T> = {
  [P in keyof T]-?: T[P];
};
type MakeRequired<T, K extends keyof T> = NotOptional<Pick<T, K>> & Omit<T, K>;

interface DiscordWindowMessage {
  userId: string;
  username: string;
  state: string | null;
}

// This is set when Discord verification is started and read upon a message back
let oAuth2State: string | undefined = undefined;

interface IssuerProps {
  telegramIssued: boolean;
  setTelegramIssued: () => void;
  discordIssued: boolean;
  setDiscordIssued: () => void;
}

function Issuer({
  telegramIssued,
  setTelegramIssued,
  discordIssued,
  setDiscordIssued,
}: IssuerProps) {
  const [telegramPending, setTelegramPending] = useState(false);
  const [discordPending, setDiscordPending] = useState(false);

  // When Discord authentication happens, a window is opened
  // that sends a 'message' event back with the user id and username
  useEffect(() => {
    const onDiscordWindowMessage = async (event: MessageEvent) => {
      if (event.origin !== config.issuers.discord.url) return;

      const {
        userId: id,
        username,
        state,
      } = event.data as DiscordWindowMessage;
      // Prevents CSRF attacks,
      // see https://auth0.com/docs/secure/attack-protection/state-parameters
      if (state !== oAuth2State)
        throw new Error('State parameter did not match.');

      await requestCredential(
        {
          platform: Platform.Discord,
          user: { id, username },
        },
        () => setDiscordPending(true),
      );

      setDiscordIssued();
    };

    const eventHandler = (event: MessageEvent) => {
      onDiscordWindowMessage(event).catch((error) => {
        alert(`An error occured: ${(error as Error).message ?? error}`);
      });
    };

    addEventListener('message', eventHandler);
    return () => removeEventListener('message', eventHandler);
  }, [setDiscordIssued]);

  const onTelegramAuth = async ({ username, ...user }: TelegramUser) => {
    try {
      if (!username) {
        throw new Error(
          'A telegram username must be available to create a credential.',
        );
      }

      await requestCredential(
        {
          platform: Platform.Telegram,
          user: { username, ...user },
        },
        () => setTelegramPending(true),
      );
    } catch (error) {
      alert(`An error occured: ${(error as Error).message ?? error}`);
      return;
    }

    setTelegramIssued();
  };

  return (
    <ListGroup>
      <ListGroupItem>
        <ListGroupItemHeading>Telegram</ListGroupItemHeading>
        {telegramIssued ? (
          <span className="text-success">Credential issued.</span>
        ) : telegramPending ? (
          <span className="text-info">Transaction sent, please wait...</span>
        ) : (
          <TelegramLoginButton
            botName="ConcordiaTestBot"
            dataOnauth={onTelegramAuth}
            cornerRadius={3}
          />
        )}
      </ListGroupItem>
      <ListGroupItem>
        <ListGroupItemHeading>Discord</ListGroupItemHeading>
        {discordIssued ? (
          <span className="text-success">Credential issued.</span>
        ) : discordPending ? (
          <span className="text-info">Transaction sent, please wait...</span>
        ) : (
          <div className="some-btn-container">
            <DiscordLoginButton
              style={{ margin: 0, marginBottom: 5, fontSize: '12pt' }}
              size="40px"
              onClick={openDiscordVerification}
            />
          </div>
        )}
      </ListGroupItem>
    </ListGroup>
  );
}

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

async function requestCredential(
  req: TelegramRequest | DiscordRequest,
  setPending: () => void,
) {
  const issuer = config.issuers[req.platform];
  const { id, username } = req.user;

  const credential = {
    $schema: `./JsonSchema2023-${req.platform}.json`,
    type: [
      'VerifiableCredential',
      'ConcordiumVerifiableCredential',
      'SoMeCredential',
    ],
    issuer: getContractDid(issuer),
    issuanceDate: new Date().toISOString(),
    credentialSubject: { attributes: { userId: id.toString(), username } },
    credentialSchema: {
      id: `${issuer.url}/json-schemas/JsonSchema2023-${req.platform}.json`,
      type: 'JsonSchema2023',
    },
  };

  const metadataUrl = {
    url: issuer.url + '/json-schemas/credential-metadata.json',
  };

  const provider = await detectConcordiumProvider();
  let txHash: string | undefined;
  await provider.addWeb3IdCredential(credential, metadataUrl, async (id) => {
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

    const endpoint = issuer.url + '/credential';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // If we're sending Discord requests, we need to include proof of our user id
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok)
      throw new Error('Error getting credential: ' + (await response.text()));

    const { txHash: hash, credential } =
      (await response.json()) as IssuerResponse;
    txHash = hash;
    const { proof, randomness } = credential;
    return { proof, randomness };
  });

  console.log('Transaction submitted, hash:', txHash);
  setPending();

  // Loop until transaction has been finalized
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const itemSummary = await provider
        .getGrpcClient()
        .waitForTransactionFinalization(txHash!);
      console.log('Transaction completed.', itemSummary);
      break;
    } catch (error) {
      // NOT_FOUND errors just mean that the transaction hasn't been propagated yet
      if ((error as RpcError).code !== 'NOT_FOUND') throw error;
      // Sleep for half a second and try again
      console.log('Transaction not found. Retrying in 200ms...');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function openDiscordVerification() {
  oAuth2State = nanoid();

  const params = new URLSearchParams({
    client_id: config.discordClientId,
    redirect_uri: config.issuers.discord.url + '/discord-oauth2',
    response_type: 'code',
    scope: 'identify',
    state: oAuth2State,
  });

  const oAuth2URL =
    'https://discord.com/api/oauth2/authorize?' + params.toString();

  const width = window.innerWidth / 2;
  const height = window.innerHeight / 2;
  const left = window.screenX + width / 2;
  const top = window.screenY + height / 2;

  window.open(
    oAuth2URL,
    undefined,
    `popup,width=${width},height=${height},left=${left},top=${top}`,
  );
}

export default Issuer;
