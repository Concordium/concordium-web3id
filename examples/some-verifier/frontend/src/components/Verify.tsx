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
import { Config, Platform } from '../lib/types';
import Issuer from './Issuer';
import { FormEvent, PropsWithChildren, useMemo, useState } from 'react';
import _config from '../../config.json';
import RemoveVerification from './RemoveVerification';
import { hash, requestProof } from '../lib/util';
const config = _config as Config;

enum VerificationStep {
  Issue,
  Verify,
  Check,
}

const stepTitleMap: { [p in VerificationStep]: string } = {
  [VerificationStep.Issue]: 'Issue credentials',
  [VerificationStep.Verify]: 'Verification',
  [VerificationStep.Check]: 'Check verification',
};

type StepProps = PropsWithChildren<{
  step: VerificationStep;
  text: string;
}>;

function Step({ children, step, text }: StepProps) {
  return (
    <AccordionItem>
      <AccordionHeader targetId={step.toString()}>
        {stepTitleMap[step]}
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

interface PlatformOptionProps {
  children: React.ReactNode;
  id: string;
  checked: boolean;
  setChecked: (value: boolean) => void;
}

function PlatformOption({
  children,
  id,
  checked,
  setChecked,
}: PlatformOptionProps) {
  return (
    <ListGroupItem>
      <FormGroup switch>
        <Input
          className="me-2"
          type="switch"
          role="switch"
          id={id}
          name={id}
          checked={checked}
          onChange={() => setChecked(!checked)}
        />
        <Label check for={id} className="d-flex align-items-center">
          {children}
        </Label>
      </FormGroup>
    </ListGroupItem>
  );
}

export default function Verify() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [telegramIssued, setTelegramIssued] = useState(
    query.get(Platform.Telegram) === 'true',
  );
  const [discordIssued, setDiscordIssued] = useState(
    query.get(Platform.Discord) === 'true',
  );

  const [open, setOpen] = useState('0');
  const [proofError, setProofError] = useState('');

  const [telegramChecked, setTelegramChecked] = useState(telegramIssued);
  const [discordChecked, setDiscordChecked] = useState(discordIssued);
  const [fullNameChecked, setFullNameChecked] = useState(false);

  const checkedCount = useMemo(() => {
    const count = +telegramChecked + +discordChecked + +fullNameChecked;
    if (count >= 2) setProofError('');
    return count;
  }, [telegramChecked, discordChecked, fullNameChecked]);

  const issueTelegram = () => {
    setTelegramChecked(true);
    setTelegramIssued(true);
    const url = new URL(window.location.href);
    url.searchParams.set(Platform.Telegram, 'true');
    window.history.replaceState(null, '', url);
  };
  const issueDiscord = () => {
    setDiscordChecked(true);
    setDiscordIssued(true);
    const url = new URL(window.location.href);
    url.searchParams.set(Platform.Discord, 'true');
    window.history.replaceState(null, '', url);
  };

  const prove = (event: FormEvent) => {
    event.preventDefault();
    if (checkedCount < 2) {
      setProofError('Please select at least two options.');
      return;
    }
    const issuers = [];
    if (telegramChecked) issuers.push(config.issuers[Platform.Telegram]);
    if (discordChecked) issuers.push(config.issuers[Platform.Discord]);

    (async () => {
      const timestamp = new Date().toISOString();
      const challenge = await hash(timestamp);
      const proof = await requestProof(issuers, challenge, {
        revealName: fullNameChecked,
        revealUsername: true,
      });
      const body = { proof, timestamp };

      const response = await fetch('/verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setProofError('The proof was rejected.');
        console.error('Proof rejected:', await response.text());
        return;
      }

      setProofError('');
      setOpen('2');
    })().catch((error) => {
      setProofError('Proof creation failed.');
      console.error(error);
    });
  };

  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore workaround since toggle is not present on Accordion for some reason */}
      <Accordion open={open} toggle={setOpen}>
        <Step
          step={VerificationStep.Issue}
          text="Start by getting Web3 ID credentials for your social media accounts.
                If you already have them, you can proceed to verification."
        >
          <Row className="gy-3">
            <Col md={12}>
              <Issuer
                telegramIssued={telegramIssued}
                setTelegramIssued={issueTelegram}
                discordIssued={discordIssued}
                setDiscordIssued={issueDiscord}
              />
            </Col>
            <Col md={12}>
              <Button color="primary" onClick={() => setOpen('1')}>
                Done
              </Button>
            </Col>
          </Row>
        </Step>
        <Step
          step={VerificationStep.Verify}
          text="Select the credentials that you want to be verified with. Please select at least two options."
        >
          <Form onSubmit={prove}>
            <Row className="gy-3">
              <Col xs={12}>
                <ListGroup className="platform-options">
                  <PlatformOption
                    id={Platform.Telegram}
                    checked={telegramChecked}
                    setChecked={setTelegramChecked}
                  >
                    <SVG className="me-1" src={telegramColor} />
                    Telegram
                  </PlatformOption>
                  <PlatformOption
                    id={Platform.Discord}
                    checked={discordChecked}
                    setChecked={setDiscordChecked}
                  >
                    <SVG className="me-1" src={discordColor} />
                    Discord
                  </PlatformOption>
                  <PlatformOption
                    id="name"
                    checked={fullNameChecked}
                    setChecked={setFullNameChecked}
                  >
                    Reveal full name?
                  </PlatformOption>
                </ListGroup>
              </Col>
              {proofError && (
                <Col xs={12}>
                  <span className="text-danger">{proofError}</span>
                </Col>
              )}
              <Col xs={12}>
                <Button color="primary" type="submit">
                  Prove
                </Button>
              </Col>
            </Row>
          </Form>
        </Step>
        <Step
          step={VerificationStep.Check}
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
      <RemoveVerification />
    </>
  );
}
