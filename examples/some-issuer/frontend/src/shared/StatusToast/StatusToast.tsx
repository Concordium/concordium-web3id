import { Toast } from 'react-bootstrap';
import ccdLogo from 'assets/ccd-logo.svg';
import { useContext, useEffect, useState } from 'react';
import { appState } from 'shared/app-state';
import clsx from 'clsx';

function useSecondsWaited(done: boolean) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const i = setInterval(() => {
            setSeconds(s => s + 1);
        }, 1000);

        return () => {
            setSeconds(0);
            clearInterval(i);
        }
    }, [done]);

    return seconds;
}

interface Props {
    show: boolean;
    onClose(): void;
}

export default function StatusToast(props: Props) {
    const { transactionStatus, transaction } = useContext(appState);
    const secondsWaited = useSecondsWaited(transactionStatus !== 'submitted');

    if (transaction === undefined) {
        return null;
    }

    return (
        <Toast {...props}>
            <Toast.Header>
                <img src={ccdLogo} className="status-toast__icon me-2" alt="Concordium logo" />
                <strong className="me-auto">Credential status</strong>
            </Toast.Header>
            <Toast.Body className="text-start">
                <p className={clsx('mb-0', transactionStatus !== 'submitted' && 'text-muted')}>
                    Transaction submitted:{' '}
                    <a
                        className="fs-6"
                        href={`https://testnet.ccdscan.io/?dcount=1&dentity=transaction&dhash=${transaction}`}
                    >
                        {transaction?.slice(0, 10)}
                    </a>
                </p>
                {transactionStatus === 'submitted' && <p className="mb-0">Awaiting finalization: {".".repeat(secondsWaited)}</p>}
                {transactionStatus === 'finalized' && <p className="mb-0">Transaction finalized</p>}
            </Toast.Body>
        </Toast>
    );
}
