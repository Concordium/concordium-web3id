import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './discord/App';
import './scss/discord.scss';
import { Platform } from 'shared/types';

if (config.type !== Platform.Discord) {
    throw new Error('Expected discord config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
