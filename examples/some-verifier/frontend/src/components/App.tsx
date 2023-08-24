import { useState } from 'react';
import '../scss/App.scss';
import {
  Button,
  Card,
  CardBody,
  Col,
  Row,
} from 'reactstrap';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import Verify from './Verify';

function App() {
  const [isAllowlisted, setIsAllowlisted] = useState(false);

  const connectToWallet = () => {
    (async () => {
      const provider = await detectConcordiumProvider();
      const accounts = await provider.requestAccounts();
      setIsAllowlisted(accounts !== undefined);
    })().catch(console.error);
  };

  return (
    <>
      <h1 className="mb-4">Concordium Social Media Verifier</h1>
      {isAllowlisted ? (
        <Verify />
      ) : (
        <Card>
          <CardBody>
            <Row className="gy-2">
              <Col xs={12}>Please connect to your wallet.</Col>
              <Col xs={12}>
                <Button color="primary" onClick={connectToWallet}>
                  Connect to wallet
                </Button>
              </Col>
            </Row>
          </CardBody>
        </Card>
      )}
    </>
  );
}

export default App;
