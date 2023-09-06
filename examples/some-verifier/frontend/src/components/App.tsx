import { Col, Row } from 'reactstrap';
import Verify from './Verify';
import { AppState, appState } from '../lib/app-state';
import { createRef, useCallback, useMemo } from 'react';
import { connectWallet } from '../lib/util';
import type { WalletApi } from '@concordium/browser-wallet-api-helpers';

function App() {
  const walletApi = createRef<WalletApi>();
  const concordiumProvider = useCallback(async () => {
    if (walletApi.current) {
      return walletApi.current;
    }

    return connectWallet();
  }, [walletApi]);
  const appStateValue = useMemo<AppState>(
    () => ({ concordiumProvider }),
    [concordiumProvider],
  );

  return (
    <appState.Provider value={appStateValue}>
      <Row>
        <Col xs={12} md={7}>
          <h1 className="mb-0">Concordia</h1>
          <h4 className="mb-4">Social media verifier</h4>
        </Col>
      </Row>
      <Verify />
    </appState.Provider>
  );
}

export default App;
