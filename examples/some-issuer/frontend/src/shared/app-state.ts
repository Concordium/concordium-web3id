import { createContext } from 'react';

export type TransactionStatus = 'submitted' | 'finalized' | 'error';

export interface AppState {
    transaction: string | undefined;
    transactionStatus: TransactionStatus | undefined;
    onTransactionSubmit(txHash: string): void;
    onTransactionFinalized(): void;
}

const initialAppState: AppState = {
    transaction: undefined,
    transactionStatus: undefined,
    onTransactionSubmit() {
        throw new Error('Unimplemented');
    },
    onTransactionFinalized() {
        throw new Error('Unimplemented');
    },
};

export const appState = createContext(initialAppState);
