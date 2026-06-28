// Build the proveEligibility witness inputs from a demo credential bundle + the user's XRPL account.
// The credential must be the one sealed into the deployed contract's Merkle root (see .demo-deploy.json).
import {
  fromHex,
  toHex,
  jurisdictionToUint,
  xrplAddressToBytes32,
  randomBytes32,
  requestCommitment,
} from "@mxrpl/private-credential-core";
import { createGatewayPrivateState } from "../midnight/contract.ts";

export interface DemoCredential {
  holderSecretHex: string;
  credentialIdHex: string;
  issuerRandomnessHex: string;
  birthYear: number;
  jurisdiction: string;
  schemaVersion: number;
  validUntil: number;
  merkleSiblingsHex: string[];
  merkleGoesLeft: boolean[];
}

export interface ProveRequest {
  witnessInputs: Parameters<typeof createGatewayPrivateState>[0];
  requestCommitmentHex: string;
  requestNonceHex: string;
}

/** Parse a pasted credential JSON; tolerates either the bare credential or the full .demo-deploy.json. */
export function parseCredential(json: string): DemoCredential {
  const obj = JSON.parse(json) as Record<string, unknown>;
  const c = (obj.credential ?? obj) as DemoCredential;
  if (!c.holderSecretHex || !Array.isArray(c.merkleSiblingsHex)) {
    throw new Error("not a credential bundle (missing holderSecretHex / merkleSiblingsHex)");
  }
  return c;
}

export function buildProveRequest(cred: DemoCredential, xrplAccount: string, policyEpoch = 1): ProveRequest {
  const xrplAccountId = xrplAddressToBytes32(xrplAccount);
  const requestNonce = randomBytes32();
  const witnessInputs = {
    holderSecret: fromHex(cred.holderSecretHex),
    credentialId: fromHex(cred.credentialIdHex),
    issuerRandomness: fromHex(cred.issuerRandomnessHex),
    schemaVersion: BigInt(cred.schemaVersion),
    birthYear: BigInt(cred.birthYear),
    jurisdiction: jurisdictionToUint(cred.jurisdiction),
    validUntil: BigInt(cred.validUntil),
    merkleSiblings: cred.merkleSiblingsHex.map(fromHex),
    merkleGoesLeft: cred.merkleGoesLeft,
    xrplAccountId,
    requestNonce,
  } as Parameters<typeof createGatewayPrivateState>[0];
  return {
    witnessInputs,
    requestCommitmentHex: toHex(requestCommitment({ xrplAccountId32: xrplAccountId, requestNonce, policyEpoch })),
    requestNonceHex: toHex(requestNonce),
  };
}
