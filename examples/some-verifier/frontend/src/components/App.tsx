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
import linkSvg from 'bootstrap-icons/icons/box-arrow-up-right.svg';
import telegram from 'bootstrap-icons/icons/telegram.svg';
import discord from 'bootstrap-icons/icons/discord.svg';
import telegramColor from '../assets/telegram-logo-color.svg';
import discordColor from '../assets/discord-logo-color.svg';

function App() {
  const [open, setOpen] = useState('0');

  const getCredentials = () => {
    window.open('https://google.com');
    setOpen('1');
  };

  const prove = (event: FormEvent) => {
    setOpen('2');
    event.preventDefault();
  };

  return (
    <>
      <h1 className="mb-4">Concordium Social Media Verifier</h1>
      {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore workaround since toggle is not present on Accordion for some reason
        <Accordion open={open} toggle={setOpen}>
          <Step
            step={0}
            text="Start by getting Web3 ID credentials for your social media accounts.
                  If you already have them, you can proceed to Step 2."
          >
            <Col md={12}>
              <Button
                className="d-flex align-items-center"
                color="primary"
                onClick={getCredentials}
              >
                Get Credentials
                <SVG className="ms-2" src={linkSvg} />
              </Button>
            </Col>
          </Step>
          <Step
            step={1}
            text="Select the credentials that you want to be verified with."
          >
            <Form onSubmit={prove}>
              <Row className="gy-2">
                <Col md={12}>
                  <ListGroup className="platform-options">
                    <PlatformOption id="telegram">
                      <SVG className="me-1" src={telegramColor} />
                      Telegram
                    </PlatformOption>
                    <PlatformOption id="discord">
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
      }
    </>
  );
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
        <Row className="gy-2">
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
        <Input className="me-2" type="switch" role="switch" id={id} />
        <Label check for={id}>
          {children}
        </Label>
      </FormGroup>
    </ListGroupItem>
  );
}

export default App;
