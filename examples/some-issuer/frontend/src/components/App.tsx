import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import '../scss/App.scss';
import { useState } from 'react';
import { DiscordLoginButton } from 'react-social-login-buttons';
import {
  Card,
  CardBody,
  Col,
  ListGroup,
  ListGroupItem,
  ListGroupItemHeading,
  Row,
} from 'reactstrap';

function App() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  // Verified Discord
  if (code) {
    const opener = window.opener as Window;
    const openerQuery = new URLSearchParams(opener.location.search);
    openerQuery.append('discord', 'true');
    opener.location.assign(
      opener.location.href.split('?')[0] + '?' + openerQuery.toString(),
    );
    window.close();
  }

  const telegram = query.get('telegram');
  const discord = query.get('discord');

  const [telegramDone, setTelegramDone] = useState(telegram === 'true');
  const discordDone = discord === 'true';

  const onTelegramAuth = async (user: TelegramUser) => {
    const done = await checkTelegramUser(user);
    if (!done) alert('An error occured.');
    setTelegramDone(done);
    query.set('telegram', done.toString());
    window.location.search = query.toString();
  };

  // TODO: Add state parameter
  const params = new URLSearchParams({
    // TODO: Maybe send from server?
    client_id: '1127954266213056635',
    redirect_uri: window.location.href.split('?')[0],
    response_type: 'code',
    scope: 'identify',
  });
  const oAuth2URL =
    'https://discord.com/api/oauth2/authorize?' + params.toString();
  const openDiscordVerification = () => {
    window.open(oAuth2URL);
  };

  return (
    <>
      <h1 className="mb-4">Concordium Social Media Issuer</h1>
      <Row className="gy-3">
        <Col xs={12}>
          <Card>
            <CardBody>
              Please select your desired social media platforms below to receive
              your Web3 ID credentials.
            </CardBody>
          </Card>
        </Col>
        <Col xs={12}>
          <ListGroup>
            <ListGroupItem>
              <ListGroupItemHeading>Telegram</ListGroupItemHeading>
              {telegramDone ? (
                <span className="success-msg">Logged in with Telegram.</span>
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
                <span className="success-msg">Logged in with Discord.</span>
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
    </>
  );
}

async function checkTelegramUser(user: TelegramUser): Promise<boolean> {
  const loc = window.location;
  const response = await fetch(`${loc.protocol}//${loc.host}/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(user),
  });
  return response.ok;
}

export default App;
