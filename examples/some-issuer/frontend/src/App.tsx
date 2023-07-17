import { useState } from 'react';
import './App.css';
import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  // Verified Discord
  if (code) {
    const opener = window.opener as Window;
    const openerQuery = new URLSearchParams(opener.location.search);
    openerQuery.append("discord", "true");
    opener.location.assign(opener.location.href.split('?')[0] + '?' + openerQuery);
    window.close();
  }

  const discord = query.get('discord');
  const telegram = query.get('telegram');

  const [telegramDone, setTelegramDone] = useState(telegram === 'true');

  // TODO: Add state parameter
  const params = new URLSearchParams({
    // TODO: Maybe send from server?
    client_id: '1127954266213056635',
    redirect_uri: window.location.href.split('?')[0],
    response_type: 'code',
    scope: 'identify',
  });
  const oAuth2URL = 'https://discord.com/api/oauth2/authorize?' + params;

  const openDiscordVerification = () => {
    window.open(oAuth2URL);
  }

  const onTelegramAuth = async (user: TelegramUser) => {
    const done = await checkTelegramUser(user);
    if (!done)
      alert('An error occured.');
    setTelegramDone(done);
    query.set("telegram", done.toString());
    window.location.search = query.toString();
  }

  return (
    <div className="App">
      <div id='content'>
        <h1>Concordium Telegram Verification</h1>
        <div id='discord-container'>
          {discord ?
            <span className='success-msg'>Logged in with Discord.</span>
            :
            <button type='button' onClick={openDiscordVerification}>Login with Discord</button>
          }
        </div>
        <div id='telegram-container'>
          {telegramDone ?
            <span className='success-msg'>Logged in with Telegram.</span>
            :
            <TelegramLoginButton botName='concordium_bot' dataOnauth={onTelegramAuth} />
          }
        </div>
        <div id='reveal-name-container'>
          <label>Reveal name <input name='revealName' type='checkbox' /></label>
        </div>
        <div>
          <button type='submit'>Verify</button>
        </div>
      </div>
    </div>
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