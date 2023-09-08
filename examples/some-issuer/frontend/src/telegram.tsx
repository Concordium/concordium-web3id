import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './telegram/App';
import telegramLogo from 'assets/telegram-logo-color.svg';
import './scss/telegram.scss';
import { Platform } from 'shared/types';
import Layout from 'shared/Layout';

if (config.type !== Platform.Discord) {
    throw new Error('Expected telegram config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Layout platform="Telegram" logo={<img src={telegramLogo} alt="Telegram logo" />}>
            <App />
        </Layout>
    </React.StrictMode>
);
