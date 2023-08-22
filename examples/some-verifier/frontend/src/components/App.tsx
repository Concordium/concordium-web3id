import { FormEvent, useState } from 'react';
import '../scss/App.scss';
import {
  Accordion,
  AccordionBody,
  AccordionHeader,
  AccordionItem,
  Button,
  Card,
  CardBody,
  Col,
  Form,
  FormGroup,
  Input,
  Label,
  ListGroup,
  ListGroupItem,
  Row,
} from 'reactstrap';
import SVG from 'react-inlinesvg';
import telegram from 'bootstrap-icons/icons/telegram.svg';
import discord from 'bootstrap-icons/icons/discord.svg';
import telegramColor from '../assets/telegram-logo-color.svg';
import discordColor from '../assets/discord-logo-color.svg';
import Issuer from './Issuer';
import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import {
  Web3StatementBuilder,
  VerifiablePresentation,
  AttributeKeyString,
} from '@concordium/web-sdk';
import { Config, Platform } from '../lib/types';
import _config from '../../config.json';
const config = _config as Config;

function App() {
  const [open, setOpen] = useState('0');
  const [isAllowlisted, setIsAllowlisted] = useState(false);

  const connectToWallet = () => {
    (async () => {
      const provider = await detectConcordiumProvider();
      const accounts = await provider.requestAccounts();
      setIsAllowlisted(accounts !== undefined);
    })().catch(console.error);
  };

  const prove = (event: FormEvent) => {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const issuers = [];
    for (const platform of [Platform.Telegram, Platform.Discord])
      if (data.get(platform) === 'on') issuers.push(config.issuers[platform]);
    const revealName = data.get('name') === 'on';

    (async () => {
      const timestamp = new Date().toISOString();
      const challenge = await hash(timestamp);
      const proof = await requestProof(issuers, revealName, challenge);
      debugger;
      const body = { proof, timestamp };

      const response = await fetch('/verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        alert('The proof was rejected');
        console.error('Proof rejected:', await response.text());
        return;
      }

      setOpen('2');
    })().catch((error) => {
      alert('Proof creation failed.');
      console.error(error);
    });
  };

  return (
    <>
      <h1 className="mb-4">Concordium Social Media Verifier</h1>
      {isAllowlisted ? (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore workaround since toggle is not present on Accordion for some reason
        <Accordion open={open} toggle={setOpen}>
          <Step
            step={0}
            text="Start by getting Web3 ID credentials for your social media accounts.
                  If you already have them, you can proceed to Step 2."
          >
            <Row className="gy-3">
              <Col md={12}>
                <Issuer />
              </Col>
              <Col md={12}>
                <Button color="primary" onClick={() => setOpen('1')}>
                  Done
                </Button>
              </Col>
            </Row>
          </Step>
          <Step
            step={1}
            text="Select the credentials that you want to be verified with. Please select at least two options."
          >
            <Form onSubmit={prove}>
              <Row className="gy-3">
                <Col md={12}>
                  <ListGroup className="platform-options">
                    <PlatformOption id={Platform.Telegram}>
                      <SVG className="me-1" src={telegramColor} />
                      Telegram
                    </PlatformOption>
                    <PlatformOption id={Platform.Discord}>
                      <SVG className="me-1" src={discordColor} />
                      Discord
                    </PlatformOption>
                    <PlatformOption id="name">Reveal full name?</PlatformOption>
                  </ListGroup>
                </Col>
                <Col md={12}>
                  <Button color="primary" type="submit">
                    Prove
                  </Button>
                </Col>
              </Row>
            </Form>
          </Step>
          <Step
            step={2}
            text="Check your verification status with one of our social media bots."
          >
            <Row className="gx-2">
              <Col xs="auto">
                <Button
                  tag="a"
                  className="some-btn"
                  href="https://t.me/concordium_official"
                  color="secondary"
                >
                  <SVG src={telegram} />
                  Telegram
                </Button>
              </Col>
              <Col xs="auto">
                <Button
                  tag="a"
                  className="some-btn"
                  href="https://discord.gg/GpKGE2hCFx"
                  color="secondary"
                >
                  <SVG src={discord} />
                  Discord
                </Button>
              </Col>
            </Row>
          </Step>
        </Accordion>
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

async function requestProof(
  issuers: Issuer[],
  revealName: boolean,
  challenge: string,
): Promise<VerifiablePresentation> {
  let builder = new Web3StatementBuilder();

  for (const issuer of issuers) {
    builder = builder.addForVerifiableCredentials(
      [
        {
          index: BigInt(issuer.index),
          subindex: BigInt(issuer.subindex)
        },
      ],
      (b) => b.revealAttribute('userId').revealAttribute('username'),
    );
  }

  if (revealName) {
    builder = builder.addForIdentityCredentials([0, 1, 3], (b) =>
      b
        .revealAttribute(AttributeKeyString.firstName)
        .revealAttribute(AttributeKeyString.lastName),
    );
  }

  const statements = builder.getStatements();
  const provider = await detectConcordiumProvider();

  return await provider.requestVerifiablePresentation(challenge, statements);
}

async function hash(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

function Step({
  children,
  step,
  text,
}: {
  step: number;
  text: string;
} & React.PropsWithChildren) {
  return (
    <AccordionItem>
      <AccordionHeader targetId={step.toString()}>
        Step {step + 1}
      </AccordionHeader>
      <AccordionBody accordionId={step.toString()}>
        <Row className="gy-3">
          <Col md={12}>
            <Card>
              <CardBody>{text}</CardBody>
            </Card>
          </Col>
          <Col>{children}</Col>
        </Row>
      </AccordionBody>
    </AccordionItem>
  );
}

function PlatformOption({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  return (
    <ListGroupItem>
      <FormGroup switch>
        <Input className="me-2" type="switch" role="switch" id={id} name={id} />
        <Label check for={id} className="d-flex align-items-center">
          {children}
        </Label>
      </FormGroup>
    </ListGroupItem>
  );
}

export default App;
