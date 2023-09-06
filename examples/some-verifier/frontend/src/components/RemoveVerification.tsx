import { FormEvent, useContext, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Form,
  FormFeedback,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  Row,
} from 'reactstrap';
import { Platform } from '../lib/types';
import { hash, requestProof } from '../lib/util';
import { WalletApi } from '@concordium/browser-wallet-api-helpers';
import { appState } from '../lib/app-state';

export default function RemoveVerification() {
  const { concordiumProvider } = useContext(appState);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const toggle = () => setOpen((o) => !o);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const data = new FormData(event.target as HTMLFormElement);
    const platform = data.get('platform');

    if (!platform) {
      // This should never happen, as select inputs have pre-selected the first option.
      throw new Error('Expected form data to include platform value');
    }

    setPending(true);

    const timestamp = new Date().toISOString();
    const challenge = await hash(timestamp);

    let api: WalletApi;
    try {
      api = await concordiumProvider();
    } catch (e) {
      setError((e as Error).message); // We know the error type here.
      console.error(e);
      return;
    }

    try {
      const proof = await requestProof(
        api,
        [config.issuers[platform as Platform]],
        challenge,
      );

      const body = { proof, timestamp };
      const response = await fetch('/verifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Proof rejected: ${await response.text()}`);
      }

      setRemoved(true);
    } catch (e) {
      setError('Could not remove verification. Try another platform.');
      console.error('Error while trying to remove verification:', e);
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    setPending(false);
    setRemoved(false);
    setError(undefined);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} color="link">
        Remove verification?
      </Button>
      <Modal isOpen={open} toggle={toggle} onClosed={reset}>
        <ModalHeader toggle={toggle}>Verificaton removal</ModalHeader>
        <ModalBody>
          <Row>
            <Col md={12}>
              <p>
                The credentials linked in a verification are stored with a
                reference to the <i>credential ID</i> they are created with.
              </p>
              <p>
                The credential ID is the public key used to identify the holder
                of the credential, which is unique for each ID.
              </p>
              <p>
                To remove your Concordia verification, you must first prove
                ownership of a credential, which{' '}
                <b>
                  must have the same credential ID as one included in the
                  verification
                </b>
                .
              </p>
            </Col>
            <Form
              onSubmit={submit}
              onChange={() => setError(undefined)}
              className="pt-3"
            >
              <Col md={12}>
                <FormGroup>
                  <Label for="platform">Select platform</Label>
                  <Input
                    type="select"
                    name="platform"
                    id="platform"
                    invalid={Boolean(error)}
                  >
                    <option value={Platform.Discord}>Discord</option>
                    <option value={Platform.Telegram}>Telegram</option>
                  </Input>
                  {error && <FormFeedback>{error}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md={12}>
                {removed && (
                  <Alert color="success">
                    Verification successfully removed
                  </Alert>
                )}
                {removed || (
                  <Button color="danger" type="submit" disabled={pending}>
                    Remove verification
                  </Button>
                )}
              </Col>
            </Form>
          </Row>
        </ModalBody>
      </Modal>
    </>
  );
}
