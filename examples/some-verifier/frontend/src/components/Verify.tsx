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
  ModalFooter,
  Modal,
  ModalBody,
  ModalHeader,
  Row,
} from 'reactstrap';
import SVG from 'react-inlinesvg';
import telegram from 'bootstrap-icons/icons/telegram.svg';
import discord from 'bootstrap-icons/icons/discord.svg';
import telegramColor from '../assets/telegram-logo-color.svg';
import discordColor from '../assets/discord-logo-color.svg';
import { Platform } from '../lib/types';
import ccdLogo from '../assets/ccd-logo.svg';
import Issuer from './Issuer';
import {
  FormEvent,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from 'react';
import RemoveVerification from './RemoveVerification';
import { hash, requestProof } from '../lib/util';
import { appState } from '../lib/app-state';
import { WalletApi } from '@concordium/browser-wallet-api-helpers';
import manifest from '../../package.json';

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
  const [telegramIssued, setTelegramIssued] = useState(false);
  const [discordIssued, setDiscordIssued] = useState(false);

  const [open, setOpen] = useState<VerificationStep | undefined>(
    VerificationStep.Verify,
  );
  const [proofError, setProofError] = useState('');

  const [telegramChecked, setTelegramChecked] = useState(telegramIssued);
  const [discordChecked, setDiscordChecked] = useState(discordIssued);
  const [fullNameChecked, setFullNameChecked] = useState(false);

  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const togglePrivacyNotice = () => setShowPrivacyNotice((o) => !o);

  const checkedCount = useMemo(() => {
    const count = +telegramChecked + +discordChecked + +fullNameChecked;
    if (count >= 2) setProofError('');
    return count;
  }, [telegramChecked, discordChecked, fullNameChecked]);

  const issueTelegram = () => {
    setTelegramChecked(true);
    setTelegramIssued(true);
  };
  const issueDiscord = () => {
    setDiscordChecked(true);
    setDiscordIssued(true);
  };

  const submitHandler = async (event: FormEvent) => {
    event.preventDefault();
    if (checkedCount < 2) {
      setProofError('Please select at least two options.');
      return;
    }
    if (fullNameChecked) {
      togglePrivacyNotice();
    } else {
      prove(event);
    }
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
                To verify with Concordia, you need verifiable credentials for
                the corresponding social media platforms in your Concordium
                Wallet for Web.{' '}
                <strong>
                  If you already have the credentials in your wallet, you can
                  skip this step.{' '}
                </strong>
              </p>
              <p className="mb-0">
                To add credentials to your wallet, please log in to the
                platforms below.
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
                Select the platforms you want to verify, essentially proving
                ownership of the accounts referenced by the credentials in your
                wallet. Additionally, you can also choose to reveal your full
                name from an identity in your wallet.
              </p>
              <p>
                <strong>
                  If these credentials do not exists in you wallet yet, go to
                  the{' '}
                  <Button
                    color="link"
                    className="m-0 border-0 p-0 d-inline align-baseline"
                    onClick={() => setOpen(VerificationStep.Issue)}
                  >
                    {stepTitleMap[VerificationStep.Issue]}
                  </Button>{' '}
                  step to add these
                </strong>
              </p>
              <p className="mb-0">You must select at least 2 options.</p>
            </>
          }
        >
          <Form onSubmit={submitHandler}>
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
                    <SVG className="me-1" src={ccdLogo} />
                    Full name - Requires Concordium {config.network}&nbsp;{' '}
                    <strong>identity and account</strong>
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
          text={
            <>
              To check that the verification is completed successfully, you can
              perform a <b>/check</b> on your own user by interacting with the
              bot on either platform.
            </>
          }
        >
          <Row className="gx-2">
            <Col xs="auto">
              <Button
                tag="a"
                className="some-btn"
                href={config.telegramInviteLink}
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
                href={config.discordInviteLink}
                color="secondary"
              >
                <SVG src={discord} />
                Discord
              </Button>
            </Col>
          </Row>
        </Step>
      </Accordion>
      <Modal
        isOpen={showPrivacyNotice}
        onClosed={() => setShowPrivacyNotice(false)}
        toggle={togglePrivacyNotice}
      >
        <ModalHeader toggle={togglePrivacyNotice}>
          <b>IMPORTANT PRIVACY NOTICE</b>
        </ModalHeader>
        <ModalBody>
          <p>
            Please observe that if you select the "Full name - requires
            Concordium mainnet identity and account" option, your personal full
            name on Discord and/or Telegram will be exposed, depending on what
            social media options you choose.
          </p>

          <p>
            If you only select the Telegram and Discord options, then only your
            username from the platform that is used for verification will be
            exposed on the platform you are verifying. For example, if you are
            using your Discord profile to verify your Telegram account, your
            Discord username will be displayed in your Telegram channel upon
            verification.
          </p>

          <p>
            The selected information may thus be visible to any person that have
            access to the communication channel that you use to post messages,
            including persons that may not be known to you.
          </p>

          <p>
            Please observe that once your full name or user name has been
            displayed on the relevant social media platform, the name will
            remain there permanently. You will not be able to remove this
            information again.
          </p>

          <p>
            You may however at any time change your selection of options and in
            that way disable any future request to show your full name or user
            ID. But your name or user name will not be deleted from previous
            communication in the relevant channel / social media platform.
          </p>
        </ModalBody>
        <ModalFooter class="modal-footer">
          <Button
            color="secondary"
            onClick={(event) => {
              prove(event);
              setShowPrivacyNotice(false);
            }}
          >
            I understand
          </Button>
          <Button color="tertiary" onClick={() => setShowPrivacyNotice(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <div className="d-flex align-items-start align-items-md-center justify-content-between flex-wrap text-opacity-25 text-body m-1">
        <RemoveVerification className="p-0 border-top-0" />
        <div className="d-flex flex-column flex-md-row align-items-end align-items-md-center">
          <a
            href="https://developer.concordium.software/en/mainnet/net/resources/terms-and-conditions-concordia.html#about-concordia"
            target="_blank"
            rel="noreferrer"
          >
            About Concordia
          </a>
          <span className="d-none d-md-inline mx-2">|</span>
          <a
            href="https://developer.concordium.software/en/mainnet/net/resources/terms-and-conditions-concordia.html#terms-of-service"
            target="_blank"
            rel="noreferrer"
          >
            Terms of use
          </a>
          <span className="d-none d-md-inline mx-2">|</span>
          <span>v{manifest.version}</span>
        </div>
      </div>
    </>
  );
}
