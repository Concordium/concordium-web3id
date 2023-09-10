import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './discord/App';
import discordLogo from 'assets/discord-logo-color.svg';
import './scss/discord.scss';
import { Platform } from 'shared/types';
import Layout from 'shared/Layout';

if (config.type !== Platform.Discord) {
  throw new Error('Expected discord config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Layout
      platform="Discord"
      logo={<img src={discordLogo} alt="Discord logo" />}
    >
      <App />
    </Layout>
  </React.StrictMode>,
);
