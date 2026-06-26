import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toHex, fromHex } from "../src/bytes.ts";
import { xrplAddressToBytes32 } from "../src/account-id.ts";
import { TAG, POLICY_ID32, hashVec } from "../src/hash.ts";
import { deriveHolderKey, credentialLeaf, requestCommitment, nullifier, jurisdictionToUint, type PrivateCredential } from "../src/credential.ts";

const v = JSON.parse(readFileSync(fileURLToPath(new URL("./vectors/credential.json", import.meta.url)), "utf8")) as {
  inputs: { holderSecretHex: string; credentialIdHex: string; issuerRandomnessHex: string; requestNonceHex: string; schemaVersion: number; birthYear: number; jurisdictionCode: string; validUntilPolicyEpoch: number; xrplAddress: string; policyEpoch: number };
  expected: { policyId32Hex: string; accountId32Hex: string; holderKeyHex: string; credentialLeafHex: string; requestCommitmentHex: string; nullifierHex: string };
};

const holderSecret = fromHex(v.inputs.holderSecretHex);
const credentialId = fromHex(v.inputs.credentialIdHex);
const issuerRandomness = fromHex(v.inputs.issuerRandomnessHex);
const requestNonce = fromHex(v.inputs.requestNonceHex);
const holderKey = deriveHolderKey(holderSecret);
const accountId32 = xrplAddressToBytes32(v.inputs.xrplAddress);

function makeCred(over: Partial<PrivateCredential> = {}): PrivateCredential {
  return {
    schemaVersion: v.inputs.schemaVersion,
    credentialId,
    holderKey,
    birthYear: v.inputs.birthYear,
    jurisdictionCode: v.inputs.jurisdictionCode,
    validUntilPolicyEpoch: v.inputs.validUntilPolicyEpoch,
    issuerRandomness,
    ...over,
  };
}

test("GOLDEN: derivations reproduce the cross-language vectors exactly", () => {
  assert.equal(toHex(POLICY_ID32), v.expected.policyId32Hex, "policyId32");
  assert.equal(toHex(accountId32), v.expected.accountId32Hex, "accountId32");
  assert.equal(toHex(holderKey), v.expected.holderKeyHex, "holderKey");
  assert.equal(toHex(credentialLeaf(makeCred())), v.expected.credentialLeafHex, "credentialLeaf");
  assert.equal(toHex(requestCommitment({ xrplAccountId32: accountId32, requestNonce, policyEpoch: v.inputs.policyEpoch })), v.expected.requestCommitmentHex, "requestCommitment");
  assert.equal(toHex(nullifier({ holderSecret, credentialId })), v.expected.nullifierHex, "nullifier");
});

test("derivations are deterministic", () => {
  assert.equal(toHex(deriveHolderKey(holderSecret)), toHex(deriveHolderKey(holderSecret)));
  assert.equal(toHex(credentialLeaf(makeCred())), toHex(credentialLeaf(makeCred())));
});

test("domain separation: same bytes under different tags differ", () => {
  // holder_key = H(HOLDER, secret); a NULLIFIER-tagged hash of the same secret must differ.
  assert.notEqual(toHex(deriveHolderKey(holderSecret)), toHex(hashVec([TAG.NULLIFIER, holderSecret])));
});

test("account binding: request commitment changes with the XRPL account", () => {
  const otherAccount = xrplAddressToBytes32("r42p6zuudgYSVHHqK3rgaHmmhwoVMqPLDd");
  const a = requestCommitment({ xrplAccountId32: accountId32, requestNonce, policyEpoch: v.inputs.policyEpoch });
  const b = requestCommitment({ xrplAccountId32: otherAccount, requestNonce, policyEpoch: v.inputs.policyEpoch });
  assert.notEqual(toHex(a), toHex(b));
});

test("hiding: leaf changes if issuer randomness (opening) changes", () => {
  const r2 = new Uint8Array(issuerRandomness);
  r2[0] ^= 0x01;
  assert.notEqual(toHex(credentialLeaf(makeCred())), toHex(credentialLeaf(makeCred({ issuerRandomness: r2 }))));
});

test("nullifier binds the holder secret and credential id", () => {
  const s2 = new Uint8Array(holderSecret); s2[31] ^= 0x01;
  const c2 = new Uint8Array(credentialId); c2[31] ^= 0x01;
  const base = toHex(nullifier({ holderSecret, credentialId }));
  assert.notEqual(base, toHex(nullifier({ holderSecret: s2, credentialId })));
  assert.notEqual(base, toHex(nullifier({ holderSecret, credentialId: c2 })));
});

test("jurisdictionToUint: encoding + validation", () => {
  assert.equal(jurisdictionToUint("CA"), 0x4341n);
  assert.equal(jurisdictionToUint("CA"), 17217n);
  assert.throws(() => jurisdictionToUint("ca"), /2 uppercase letters/);
  assert.throws(() => jurisdictionToUint("USA"), /2 uppercase letters/);
  assert.throws(() => jurisdictionToUint("C1"), /2 uppercase letters/);
});

test("integer field range validation (Uint<N> bounds)", () => {
  assert.throws(() => credentialLeaf(makeCred({ schemaVersion: 256 })), /Uint<8>/); // > 255
  assert.throws(() => credentialLeaf(makeCred({ birthYear: 65536 })), /Uint<16>/); // > 65535
  assert.throws(() => credentialLeaf(makeCred({ validUntilPolicyEpoch: -1 })), /non-negative/);
  assert.throws(() => credentialLeaf(makeCred({ birthYear: 2000.5 })), /integer/);
  assert.throws(() => requestCommitment({ xrplAccountId32: accountId32, requestNonce, policyEpoch: 70000 }), /Uint<16>/);
  // boundary values are accepted
  assert.ok(credentialLeaf(makeCred({ schemaVersion: 255, birthYear: 65535, validUntilPolicyEpoch: 0 })) instanceof Uint8Array);
});

test("length validation on every entry point", () => {
  assert.throws(() => deriveHolderKey(new Uint8Array(31)), /32 bytes/);
  assert.throws(() => credentialLeaf(makeCred({ credentialId: new Uint8Array(31) })), /32 bytes/);
  assert.throws(() => credentialLeaf(makeCred({ issuerRandomness: new Uint8Array(16) })), /32 bytes/);
  assert.throws(() => requestCommitment({ xrplAccountId32: new Uint8Array(20), requestNonce, policyEpoch: 1 }), /32 bytes/);
  assert.throws(() => nullifier({ holderSecret: new Uint8Array(0), credentialId }), /32 bytes/);
});
