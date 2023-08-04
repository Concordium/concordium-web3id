import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import '../scss/Issuer.scss';
import { useEffect, useMemo, useState } from 'react';
import { DiscordLoginButton } from 'react-social-login-buttons';
import { ListGroup, ListGroupItem, ListGroupItemHeading } from 'reactstrap';
import _config from '../../config.json';
import { nanoid } from 'nanoid';
const config = _config as Config;

interface Config {
  discordClientId: string;
  issuers: Record<Platform, Issuer>;
}

enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

interface Issuer {
  url: string;
  did: string;
}

interface DiscordWindowMessage {
  userId: string;
  state: string | null;
}

// This is set when Discord verification is started and read upon a message back
let oAuth2State: string | undefined = undefined;

function Issuer() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const telegram = query.get(Platform.Telegram);
  const discord = query.get(Platform.Discord);
  const [telegramDone, setTelegramDone] = useState(telegram === 'true');
  const [discordDone, setDiscordDone] = useState(discord === 'true');
  const [telegramPending, setTelegramPending] = useState(false);
  const [discordPending, setDiscordPending] = useState(false);

  // When Discord authentication happens, a window is opened
  // that sends a 'message' event back with the user id
  useEffect(() => {
    const onDiscordWindowMessage = async (event: MessageEvent) => {
      if (event.origin !== config.issuers.discord.url) return;

      const { userId, state } = event.data as DiscordWindowMessage;
      // Prevents CSRF attacks,
      // see https://auth0.com/docs/secure/attack-protection/state-parameters
      if (state !== oAuth2State)
        throw new Error('State parameter did not match.');

      await requestCredential(
        {
          platform: Platform.Discord,
          userId,
        },
        () => setDiscordPending(true),
      );

      const url = new URL(window.location.href);
      url.searchParams.set(Platform.Discord, 'true');
      window.history.replaceState(null, '', url);
      setDiscordDone(true);
    };

    const eventHandler = (event: MessageEvent) => {
      onDiscordWindowMessage(event).catch(console.error);
    };

    addEventListener('message', eventHandler);
    return () => removeEventListener('message', eventHandler);
  }, []);

  const onTelegramAuth = async (user: TelegramUser) => {
    try {
      await requestCredential(
        {
          platform: Platform.Telegram,
          user,
        },
        () => setTelegramPending(true),
      );
    } catch (error) {
      alert('An error occured');
      console.error(error);
      return;
    }

    setTelegramDone(true);
    const url = new URL(window.location.href);
    url.searchParams.set(Platform.Telegram, 'true');
    window.history.replaceState(null, '', url);
  };

  return (
    <ListGroup>
      <ListGroupItem>
        <ListGroupItemHeading>Telegram</ListGroupItemHeading>
        {telegramDone ? (
          <span className="text-success">Credential issued.</span>
        ) : telegramPending ? (
          <span className="text-info">Transaction sent, please wait...</span>
        ) : (
          <TelegramLoginButton
            botName="concordium_bot"
            dataOnauth={onTelegramAuth}
            cornerRadius={3}
          />
        )}
      </ListGroupItem>
      <ListGroupItem>
        <ListGroupItemHeading>Discord</ListGroupItemHeading>
        {discordDone ? (
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
    signature: string;
    randomness: Record<string, string>;
  };
}

interface IssueRequest {
  credential: CredentialInfo;
  telegramUser?: TelegramUser;
}

interface CredentialInfo {
  holder_id: string;
  holder_revocable: boolean;
  valid_from: string;
  metadata_url: {
    url: string;
  };
}

interface TelegramRequest {
  platform: Platform.Telegram;
  user: TelegramUser;
}

interface DiscordRequest {
  platform: Platform.Discord;
  userId: string;
}

interface RpcError {
  code: string;
}

async function requestCredential(
  req: TelegramRequest | DiscordRequest,
  setPending: () => void,
) {
  console.log('Requesting credential...');

  const issuer = config.issuers[req.platform];

  const userId =
    req.platform === Platform.Telegram ? req.user.id.toString() : req.userId;

  const credential = {
    $schema: `./JsonSchema2023-${req.platform}.json`,
    type: [
      'VerifiableCredential',
      'ConcordiumVerifiableCredential',
      'SoMeCredential',
    ],
    issuer: issuer.did,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { userId },
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
    const body: IssueRequest = {
      credential: {
        holder_id: id,
        holder_revocable: true,
        valid_from: new Date().toISOString(),
        metadata_url: metadataUrl,
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
    const { signature, randomness } = credential;
    return { signature, randomness };
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
