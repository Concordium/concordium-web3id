import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './telegram/App.tsx';
import './scss/telegram.scss';
import { Platform } from 'shared/types.ts';

if (config.type !== Platform.Discord) {
    throw new Error('Expected telegram config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
