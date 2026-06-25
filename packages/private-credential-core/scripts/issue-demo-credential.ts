// Mock issuer CLI — SYNTHETIC demo attributes only, never real KYC.
//
// Models the §6.2 flow:
//   1. (user side) generate a holder secret, derive holder_key.
//   2. (issuer side) build a credential leaf from holder_key + synthetic attributes,
//      insert it into the current credential tree, and return the bundle + new root.
//
// Privacy posture (Phase 1 exit gate): the holder secret and the credential bundle are written
// to files the *user* holds; nothing secret is printed to stdout. Only public data (root to
// publish, leaf, policy epoch) is logged.
//
// Usage:
//   node packages/private-credential-core/scripts/issue-demo-credential.ts \
//     [--birth-year 2000] [--jurisdiction CA] [--valid-until 1] [--policy-epoch 1] [--out-dir ./demo-out]
//
// Outputs (both gitignored):
//   <out-dir>/holder-secret.json   { holderSecretHex }     <- user keeps this, never shared
//   <out-dir>/credential-bundle.json  the CredentialBundle  <- user's private bundle

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes32, toHex } from "../src/bytes.ts";
import { POLICY_V1 } from "../src/constants.ts";
import { deriveHolderKey } from "../src/credential.ts";
import { CredentialMerkleTree } from "../src/merkle.ts";
import { issueCredential, verifyCredentialBundle } from "../src/bundle.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const birthYear = Number.parseInt(arg("birth-year", "2000"), 10);
const jurisdictionCode = arg("jurisdiction", POLICY_V1.allowedJurisdiction).toUpperCase();
const validUntilPolicyEpoch = Number.parseInt(arg("valid-until", String(POLICY_V1.currentPolicyEpoch)), 10);
const policyEpoch = Number.parseInt(arg("policy-epoch", String(POLICY_V1.currentPolicyEpoch)), 10);
const outDir = resolve(arg("out-dir", "demo-out"));

// 1. user side
const holderSecret = randomBytes32();
const holderKey = deriveHolderKey(holderSecret);

// 2. issuer side — fresh tree per run (persisting/rotating the tree is a Phase 2/issuer-service concern)
const tree = new CredentialMerkleTree();
const { bundle, index } = issueCredential({
  tree,
  holderKey,
  birthYear,
  jurisdictionCode,
  validUntilPolicyEpoch,
  policyEpoch,
});

const check = verifyCredentialBundle(bundle);
if (!check.ok) {
  console.error("issued bundle failed self-verification:", check.reasons);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "holder-secret.json"), JSON.stringify({ holderSecretHex: toHex(holderSecret) }, null, 2) + "\n");
writeFileSync(resolve(outDir, "credential-bundle.json"), JSON.stringify(bundle, null, 2) + "\n");

// public summary only — no secrets, no private attributes
console.log("mock issuer: SYNTHETIC demo credential issued (not real KYC)");
console.log(`  leaf index:       ${index}`);
console.log(`  credential leaf:  ${bundle.leaf}`);
console.log(`  root to publish:  ${bundle.credentialRoot}`);
console.log(`  policy epoch:     ${bundle.policyEpoch}  (policyId32 ${bundle.policyId32})`);
console.log(`  bundle written:   ${resolve(outDir, "credential-bundle.json")}`);
console.log(`  holder secret:    ${resolve(outDir, "holder-secret.json")}  (KEEP PRIVATE — never share)`);
