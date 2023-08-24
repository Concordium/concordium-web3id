import { AttributeKeyString, VerifiablePresentation, Web3StatementBuilder } from "@concordium/web-sdk";
import { Issuer } from "../lib/types";
import { detectConcordiumProvider } from "@concordium/browser-wallet-api-helpers";

export async function hash(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

export async function requestProof(
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
