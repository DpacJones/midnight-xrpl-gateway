// Generates a synthetic demo policy + one matching credential for a one-time admin deploy. The deploy
// seals the contract with this credential's Merkle root; the demo user proves eligibility with the
// returned credential bundle. Synthetic data only (testnet). Mirrors apps/e2e-harness/deploy-and-prove.
import {
  randomBytes32,
  hashVec,
  TAG,
  POLICY_ID32,
  deriveHolderKey,
  credentialLeaf,
  CredentialMerkleTree,
  jurisdictionToUint,
  toHex,
} from "@mxrpl/private-credential-core";
import type { GatewayCtorArgs } from "../midnight/gateway-api.ts";

const CUTOFF = 2008n; // born <= 2008 ⇒ adult
const ALLOWED_JUR = "CA";

/** The demo holder's credential — the witness bundle they need to prove (minus the prove-time XRPL nonce/account). */
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

export interface DemoPolicy {
  args: GatewayCtorArgs;
  policyIdHex: string;
  adminSecretHex: string; // keep this to rotate the root later (setPolicyRoot)
  credential: DemoCredential;
}

export function createDemoPolicy(): DemoPolicy {
  const adminSecret = randomBytes32();
  const adminKey = hashVec([TAG.ADMIN, adminSecret]);

  const holderSecret = randomBytes32();
  const credentialId = randomBytes32();
  const issuerRandomness = randomBytes32();
  const holderKey = deriveHolderKey(holderSecret);
  const leaf = credentialLeaf({
    schemaVersion: 1,
    credentialId,
    holderKey,
    birthYear: 2000,
    jurisdictionCode: ALLOWED_JUR,
    validUntilPolicyEpoch: 1,
    issuerRandomness,
  });
  const tree = CredentialMerkleTree.from([leaf], 16);
  const path = tree.pathFor(0);

  return {
    args: [adminKey, POLICY_ID32, tree.root(), 1n, CUTOFF, jurisdictionToUint(ALLOWED_JUR)],
    policyIdHex: toHex(POLICY_ID32),
    adminSecretHex: toHex(adminSecret),
    credential: {
      holderSecretHex: toHex(holderSecret),
      credentialIdHex: toHex(credentialId),
      issuerRandomnessHex: toHex(issuerRandomness),
      birthYear: 2000,
      jurisdiction: ALLOWED_JUR,
      schemaVersion: 1,
      validUntil: 1,
      merkleSiblingsHex: path.entries.map((e) => toHex(e.sibling)),
      merkleGoesLeft: path.entries.map((e) => e.goesLeft),
    },
  };
}
