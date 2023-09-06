import Verify from './Verify';
import { AppState, appState } from '../lib/app-state';
import {
  MutableRefObject,
  createRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  ConnectionError,
  ConnectionErrorCode,
  connectWallet,
} from '../lib/util';
import type { WalletApi } from '@concordium/browser-wallet-api-helpers';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

const CHROME_STORE_URL =
  'https://chrome.google.com/webstore/detail/concordium-wallet/mnnkpffndmickbiakofclnpoiajlegmg';

function App() {
  const walletApi = createRef<WalletApi | undefined>() as MutableRefObject<
    WalletApi | undefined
  >;
  const [showModal, setShowModal] = useState(false);
  const toggleModal = () => setShowModal((o) => !o);
  const concordiumProvider = useCallback(async () => {
    if (!walletApi.current) {
      try {
        walletApi.current = await connectWallet();
      } catch (e) {
        if (
          e instanceof ConnectionError &&
          e.code === ConnectionErrorCode.NOT_FOUND
        ) {
          setShowModal(true);
        }

        throw e;
      }
    }
    return walletApi.current;
  }, [walletApi]);
  const appStateValue = useMemo<AppState>(
    () => ({ concordiumProvider }),
    [concordiumProvider],
  );

  return (
    <appState.Provider value={appStateValue}>
      <div className="text-center">
        <h1 className="mb-0">Concordia</h1>
        <h4 className="mb-4">Social media verifier</h4>
      </div>
      <Verify />
      <Modal
        isOpen={showModal}
        onClosed={() => setShowModal(false)}
        toggle={toggleModal}
      >
        <ModalHeader toggle={toggleModal}>
          Concordium wallet not found
        </ModalHeader>
        <ModalBody>
          <p>
            We could not find the concordium browser wallet extension for your
            browser. This is required for the application to work.
          </p>
          <p>
            You can download the wallet in the{' '}
            <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
              Chrome web store
            </a>
          </p>
        </ModalBody>
      </Modal>
    </appState.Provider>
  );
}

export default App;
