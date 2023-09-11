import { DiscordLoginButton } from 'react-social-login-buttons';
import { nanoid } from 'nanoid';
import { DiscordConfig } from '../types';
import { requestCredential } from 'shared/util';
import { Platform } from 'shared/types';
import { useContext, useEffect } from 'react';
import { appState } from 'shared/app-state';

type DiscordWindowMessage =
  | {
      type: 'success';
      userId: string;
      username: string;
      state: string | null;
    }
  | { type: 'error'; error: string; state: string | null };

const ISSUER_URL = location.href;
const { discordClientId } = config as DiscordConfig;

let oAuth2State: string | undefined;

let oAuthWindow: Window | null;

function openDiscordVerification() {
  oAuth2State = nanoid();

  const params = new URLSearchParams({
    client_id: discordClientId,
    redirect_uri: ISSUER_URL + 'discord-oauth2',
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

  oAuthWindow = window.open(
    oAuth2URL,
    undefined,
    `popup,width=${width},height=${height},left=${left},top=${top}`,
  );
}

function App() {
  const { onTransactionFinalized, onTransactionSubmit } = useContext(appState);
  // When Discord authentication happens, a window is opened
  // that sends a 'message' event back with the user id and username
  useEffect(() => {
    const onDiscordWindowMessage = async (event: MessageEvent) => {
      // Check that the message is coming from the window we just created.
      if (!oAuthWindow || event.source !== oAuthWindow) return;
      if (event.origin + '/' !== ISSUER_URL) return;
      const data = event.data as DiscordWindowMessage;
      // Prevents CSRF attacks,
      // see https://auth0.com/docs/secure/attack-protection/state-parameters
      if (data.state !== oAuth2State) return;

      if (data.type === 'error') {
        // Do nothing for now.
        // At some point we can handle different error types.
      } else if (data.type === 'success') {
        await requestCredential(
          {
            platform: Platform.Discord,
            user: { id: data.userId, username: data.username },
          },
          onTransactionSubmit,
          onTransactionFinalized,
        );
      }
    };

    const eventHandler = (event: MessageEvent) => {
      onDiscordWindowMessage(event).catch((error) => {
        alert(`An error occured: ${(error as Error).message ?? error}`);
      });
    };

    addEventListener('message', eventHandler);
    return () => removeEventListener('message', eventHandler);
  }, [onTransactionFinalized, onTransactionSubmit]);

  return (
    <DiscordLoginButton
      className="app__login"
      size="40px"
      onClick={openDiscordVerification}
    />
  );
}

export default App;
