import {
  Accordion,
  AccordionBody,
  AccordionHeader,
  AccordionItem,
  Button,
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
import ccdLogo from '../assets/ccd-logo.svg';
import { Config, Platform } from '../lib/types';
import Issuer from './Issuer';
import {
  FormEvent,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from 'react';
import _config from '../../config.json';
import RemoveVerification from './RemoveVerification';
import { hash, requestProof } from '../lib/util';
import { appState } from '../lib/app-state';
import { WalletApi } from '@concordium/browser-wallet-api-helpers';
const config = _config as Config;

enum VerificationStep {
  Issue = '0',
  Verify = '1',
  Check = '2',
}

const stepTitleMap: { [p in VerificationStep]: string } = {
  [VerificationStep.Issue]: 'Issue credentials',
  [VerificationStep.Verify]: 'Verification',
  [VerificationStep.Check]: 'Check verification',
};

type StepProps = PropsWithChildren<{
  step: VerificationStep;
  text: string | JSX.Element;
}>;

function Step({ children, step, text }: StepProps) {
  return (
    <AccordionItem>
      <AccordionHeader targetId={step.toString()}>
        {stepTitleMap[step]}
      </AccordionHeader>
      <AccordionBody accordionId={step.toString()}>
        <Row className="gy-3">
          <Col xs={12}>{text}</Col>
          <Col xs={12}>{children}</Col>
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
  const { concordiumProvider } = useContext(appState);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [telegramIssued, setTelegramIssued] = useState(
    query.get(Platform.Telegram) === 'true',
  );
  const [discordIssued, setDiscordIssued] = useState(
    query.get(Platform.Discord) === 'true',
  );

  const [open, setOpen] = useState<VerificationStep | undefined>(
    VerificationStep.Issue,
  );
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

  const prove = async (event: FormEvent) => {
    event.preventDefault();
    if (checkedCount < 2) {
      setProofError('Please select at least two options.');
      return;
    }
    const issuers = [];
    if (telegramChecked) issuers.push(config.issuers[Platform.Telegram]);
    if (discordChecked) issuers.push(config.issuers[Platform.Discord]);

    let api: WalletApi;
    try {
      api = await concordiumProvider();
    } catch (e) {
      setProofError((e as Error).message); // We know the error type here.
      console.error(e);
      return;
    }

    const timestamp = new Date().toISOString();
    const challenge = await hash(timestamp);

    try {
      const proof = await requestProof(api, issuers, challenge, {
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
      setOpen(VerificationStep.Check);
    } catch (e) {
      setProofError('Proof creation failed.');
      console.error(e);
    }
  };

  const toggle = (id: VerificationStep) => {
    if (open === id) {
      setOpen(undefined);
    } else {
      setOpen(id);
    }
  };

  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore workaround since toggle is not present on Accordion for some reason */}
      <Accordion open={open ?? ''} toggle={toggle}>
        <Step
          step={VerificationStep.Issue}
          text={
            <>
              <p>
                To verify with Concordia, you need web3 ID credentials for the
                corresponding social media platforms in your wallet. If you
                already have the credentials in your wallet, you can skip this
                step
              </p>
              <p className="mb-0">
                To add credentials to your wallet, please log to the platforms
                below.
              </p>
            </>
          }
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
              <Button
                color="secondary"
                onClick={() => setOpen(VerificationStep.Verify)}
              >
                Continue
              </Button>
            </Col>
          </Row>
        </Step>
        <Step
          step={VerificationStep.Verify}
          text={
            <>
              <p>
                Select the platforms you want to verify with, essentially
                proving ownership of the accounts referenced by the credentials in your wallet.
                Additionally, you can also choose to reveal your full name from
                an identity in your wallet.
              </p>
              <p className='mb-0'>You must select at least 2 options.</p>
            </>
          }
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
                    <SVG className='me-1' src={ccdLogo} />
                    Full name
                  </PlatformOption>
                </ListGroup>
              </Col>
              {proofError && (
                <Col xs={12}>
                  <span className="text-danger">{proofError}</span>
                </Col>
              )}
              <Col xs={12}>
                <Button color="secondary" type="submit">
                  Verify
                </Button>
              </Col>
            </Row>
          </Form>
        </Step>
        <Step
          step={VerificationStep.Check}
          text={<>
            To check that the verification is completed successfully, you can perform a "/check" on your own user, by interacting with the bot on either platform.
          </>}
        >
          <Row className="gx-2">
            <Col xs="auto">
              <Button
                tag="a"
                className="some-btn"
                href="https://t.me/+lT6h2k5ZGBw2ZGZk"
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
                href="https://discord.gg/jpYES7RYF"
                color="secondary"
              >
                <SVG src={discord} />
                Discord
              </Button>
            </Col>
          </Row>
        </Step>
      </Accordion >
      <RemoveVerification />
    </>
  );
}
