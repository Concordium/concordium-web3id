import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import '../scss/App.scss';
import { useEffect, useMemo, useState } from 'react';
import { DiscordLoginButton } from 'react-social-login-buttons';
import {
  Button,
  Card,
  CardBody,
  Col,
  ListGroup,
  ListGroupItem,
  ListGroupItemHeading,
  Row,
} from 'reactstrap';

function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const discordId = query.get('discordId');
  const telegram = query.get('telegram');
  const discord = query.get('discord');
  const [telegramDone, setTelegramDone] = useState(telegram === 'true');
  const [discordDone, setDiscordDone] = useState(discord === 'true');
  const [telegramPending, setTelegramPending] = useState(false);
  const [discordPending, setDiscordPending] = useState(false);

  // We might just have been refreshed due to Oauth2, so
  const [isAllowlisted, setIsAllowlisted] = useState(
    discordDone || telegramDone || discordId !== null,
  );

  const connectToWallet = () => {
    (async () => {
      const provider = await detectConcordiumProvider();
      const accounts = await provider.requestAccounts();
      setIsAllowlisted(accounts !== undefined);
    })().catch(console.error);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('discordId');
    if (discordId)
      requestCredential({
        platform: 'Discord',
        userId: discordId,
        setPending: () => setDiscordPending(true),
      })
        .then(() => {
          setDiscordDone(true);
          url.searchParams.set('discord', 'true');
        })
        .catch(console.error)
        .finally(() => window.history.replaceState(null, '', url));
  }, [discordId, query]);

  const onTelegramAuth = async (user: TelegramUser) => {
    try {
      await requestCredential({
        platform: 'Telegram',
        user,
        setPending: () => setTelegramPending(true),
      });
    } catch (error) {
      alert('An error occured');
      console.error(error);
      return;
    }

    setTelegramDone(true);
    const url = new URL(window.location.href);
    url.searchParams.set('telegram', 'true');
    window.history.replaceState(null, '', url);
  };

  return (
    <>
      <h1 className="mb-4">Concordium Social Media Issuer</h1>
      {isAllowlisted ? (
        <Row className="gy-3">
          <Col xs={12}>
            <Card>
              <CardBody>
                Please select your desired social media platforms below to
                receive your Web3 ID credentials.
              </CardBody>
            </Card>
          </Col>
          <Col xs={12}>
            <ListGroup>
              <ListGroupItem>
                <ListGroupItemHeading>Telegram</ListGroupItemHeading>
                {telegramDone ? (
                  <span className="text-success">Credential issued.</span>
                ) : telegramPending ? (
                  <span className="text-info">
                    Transaction sent, please wait...
                  </span>
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
                  <span className="text-info">
                    Transaction sent, please wait...
                  </span>
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
          </Col>
        </Row>
      ) : (
        <Card>
          <CardBody>
            <Row className="gy-2">
              <Col xs={12}>Please connect to your wallet.</Col>
              <Col xs={12}>
                <Button color="primary" onClick={connectToWallet}>
                  Connect to wallet
                </Button>
              </Col>
            </Row>
          </CardBody>
        </Card>
      )}
    </>
  );
}

interface IssuerResponse {
  txHash: string;
  credential: {
    signature: string;
    randomness: Record<string, string>;
  };
}

interface CredentialInfo {
  holder_id: string;
  holder_revocable: boolean;
  valid_from: string;
  metadata_url: {
    url: string;
  };
}

interface IssueRequest {
  credential: CredentialInfo;
  values: Record<number, string>;
  telegramUser?: TelegramUser;
}

interface TelegramRequest {
  platform: 'Telegram';
  user: TelegramUser;
  setPending: () => void;
}

interface DiscordRequest {
  platform: 'Discord';
  userId: string;
  setPending: () => void;
}

interface RpcError {
  code: string;
}

async function requestCredential(req: TelegramRequest | DiscordRequest) {
  console.log('Requesting credential...');

  const userId =
    req.platform === 'Telegram' ? req.user.id.toString() : req.userId;

  const credential = {
    $schema: './JsonSchema2023-some.json',
    type: [
      'VerifiableCredential',
      'ConcordiumVerifiableCredential',
      'SoMeCredential',
    ],
    issuer: 'did:ccd:testnet:sci:5565:0/issuer',
    issuanceDate: new Date().toISOString(),
    credentialSubject: { platform: req.platform, userId },
    credentialSchema: {
      id:
        window.location.href.split('?')[0] +
        'json-schemas/JsonSchema2023-some.json',
      type: 'JsonSchema2023',
    },
  };

  const metadataUrl = {
    url:
      window.location.href.split('?')[0] +
      'json-schemas/credential-metadata.json',
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
      values: {
        0: req.platform,
        1: userId,
      },
    };
    if (req.platform === 'Telegram') body.telegramUser = req.user;

    const endpoint = window.location.href.split('?')[0] + 'credential';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
  req.setPending();

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
      console.log('Transaction not found. Retrying in 500ms...');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function openDiscordVerification() {
  // TODO: Add state parameter
  const params = new URLSearchParams({
    // TODO: Maybe send from server?
    client_id: '1127954266213056635',
    redirect_uri: window.location.href.split('?')[0] + 'discord-oauth2',
    response_type: 'code',
    scope: 'identify',
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

export default App;
