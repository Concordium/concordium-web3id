import { useState } from 'react';
import { Button, Col, Row } from 'reactstrap';
import SVG from 'react-inlinesvg';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import Verify from './Verify';
import CcdLogo from '../assets/ccd-logo.svg';

function App() {
  const [isAllowlisted, setIsAllowlisted] = useState(false);

  const connectToWallet = async () => {
    try {
      const provider = await detectConcordiumProvider();
      const accounts = await provider.requestAccounts();
      setIsAllowlisted(accounts !== undefined);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <Row>
        <Col xs={12} md={7}>
          <h1 className="mb-0">Concordia</h1>
          <h4 className="mb-4">Social media verifier</h4>
        </Col>
        {!isAllowlisted && (
          <Col xs={12} md={5}>
            <Button
              className="float-md-end d-inline-flex align-items-center mb-4"
              color="primary"
              onClick={connectToWallet}
            >
              Connect to wallet
              <SVG src={CcdLogo} className="ccd-logo ps-2" />
            </Button>
          </Col>
        )}
      </Row>
      <Verify isLocked={!isAllowlisted} />
    </>
  );
}

export default App;
