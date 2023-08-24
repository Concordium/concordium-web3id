import { FormEvent, useState } from "react";
import { Alert, Button, Card, CardBody, Col, Form, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalHeader, Row } from "reactstrap";
import { Config, Platform } from "../lib/types";
import { hash, requestProof } from "./util";
import _config from '../../config.json';
const config = _config as Config;

export default function RemoveVerification() {
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

    try {
      const timestamp = new Date().toISOString();
      const challenge = await hash(timestamp);
      const proof = await requestProof([config.issuers[platform as Platform]], false, challenge);

      const body = { proof, timestamp };
      const response = await fetch('/verifications/remove', {
        method: 'POST',
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

  return (
    <>
      <Button onClick={() => setOpen(true)} color="link">Remove verification?</Button>
      <Modal isOpen={open} toggle={toggle}>
        <ModalHeader toggle={toggle}>Verificaton removal</ModalHeader>
        <ModalBody>
          <Card>
            <CardBody>
              To remove your concordia verification, you must first prove ownership of an account included in the verification.
            </CardBody>
          </Card>
          <Form onSubmit={submit} onChange={() => setError(undefined)} className="pt-3">
            <Row>
              <Col md={12}>
                <FormGroup>
                  <Label>Select platform</Label>
                  <Input type="select" name="platform" invalid={Boolean(error)}>
                    <option value={Platform.Discord}>Discord</option>
                    <option value={Platform.Telegram}>Telegram</option>
                  </Input>
                  {error && <FormFeedback>{error}</FormFeedback>}
                </FormGroup>
              </Col>
              <Col md={12}>
                {removed && <Alert color="success">Verification successfully removed</Alert>}
                {removed || (
                  <Button color="danger" type="submit" disabled={pending}>
                    Remove verification
                  </Button>
                )}
              </Col>
            </Row>
          </Form>
        </ModalBody>
      </Modal>
    </>
  )
}
