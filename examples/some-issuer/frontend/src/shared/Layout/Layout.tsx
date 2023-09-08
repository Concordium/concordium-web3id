import { PropsWithChildren, useCallback, useMemo, useState } from 'react';
import ccdLogo from 'assets/ccd-logo.svg';
import StatusToast from 'shared/StatusToast';
import { ToastContainer } from 'react-bootstrap';
import { appState, AppState } from 'shared/app-state';

type Props = PropsWithChildren<{
    logo: JSX.Element;
    platform: string;
}>;

function Layout({ platform, children, logo }: Props) {
    const [showStatus, setShowStatus] = useState(true);
    const [txState, setTxState] = useState<Pick<AppState, 'transaction' | 'transactionStatus'>>({
        transactionStatus: undefined,
        transaction: undefined,
    });

    const onTransactionSubmit = useCallback((transaction: string) => {
        setTxState({ transaction, transactionStatus: 'submitted' });
    }, []);
    const onTransactionFinalized = useCallback(() => {
        setTxState((s) => ({ ...s, transactionStatus: 'finalized' }));
    }, []);

    const appStateValue: AppState = useMemo(
        () => ({
            ...txState,
            onTransactionSubmit,
            onTransactionFinalized,
        }),
        [txState, onTransactionSubmit, onTransactionFinalized]
    );

    return (
        <appState.Provider value={appStateValue}>
            <main className="layout">
                <div className="d-inline-flex align-items-center">
                    <div className="layout__logo">
                        <img src={ccdLogo} alt="Concordium logo" />
                    </div>
                    <div className="layout__plus">+</div>
                    <div className="layout__logo">{logo}</div>
                </div>
                <h1>{platform} Web3 ID issuer</h1>
                <h4 className="mb-4">
                    Create your Web3 ID credential for {platform} by logging in. This process includes the steps:
                </h4>
                <ol className="text-start mb-5">
                    <li>Log in with with {platform}</li>
                    <li>Accept request to add credential to your wallet</li>
                    <li>Finalization of credential registration on Concordium {config.network}</li>
                </ol>
                {children}
                <ToastContainer position="top-end" className="p-4">
                    <StatusToast show={showStatus} onClose={() => setShowStatus(false)} />
                </ToastContainer>
            </main>
        </appState.Provider>
    );
}

export default Layout;
