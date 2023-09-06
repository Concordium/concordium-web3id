import { WalletApi } from '@concordium/browser-wallet-api-helpers';
import { createContext } from 'react';

export interface AppState {
  concordiumProvider(): Promise<WalletApi>;
}

const initialAppState: AppState = {
  concordiumProvider: () => {
    throw new Error('App not initiated'); // This will never happen
  },
};

export const appState = createContext<AppState>(initialAppState);
