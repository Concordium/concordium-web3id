import discordLogo from 'assets/discord-logo-color.svg';
import { DiscordLoginButton } from 'react-social-login-buttons';
import { nanoid } from 'nanoid';
import { DiscordConfig } from '../types';
import Layout from 'shared/Layout';

const { discordClientId } = config as DiscordConfig;

function openDiscordVerification() {
  const oAuth2State = nanoid();

  const params = new URLSearchParams({
    client_id: discordClientId,
    redirect_uri: location.href + 'discord-oauth2',
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

function App() {

  return (
    <Layout platform="Discord" logo={<img src={discordLogo} alt="Discord logo" />}>
      <DiscordLoginButton
        className="app__login"
        size="40px"
        onClick={openDiscordVerification}
      />
    </Layout>
  )
}

export default App
