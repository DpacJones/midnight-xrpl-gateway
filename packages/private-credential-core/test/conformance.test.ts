// Cross-language conformance (Codex ruling, option b): the compiled Compact pureCircuits.* are
// the oracle. Each derivation must agree between (1) the circuit, (2) the independent TS impl,
// and (3) the committed golden vectors. Vectors are only valid when all three match.
//
// Requires the contract compiled to ../../../contracts/private-credential-gateway/managed.
// If absent, the test is skipped (run `compact compile ...` first — see contracts/.../README).

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { toHex, fromHex } from "../src/bytes.ts";
import { xrplAddressToBytes32 } from "../src/account-id.ts";
import { POLICY_ID32 } from "../src/hash.ts";
import { deriveHolderKey, credentialLeaf, requestCommitment, nullifier, jurisdictionToUint, type PrivateCredential } from "../src/credential.ts";

const bindingsUrl = new URL("../../../contracts/private-credential-gateway/managed/contract/index.js", import.meta.url);
const vectorsUrl = new URL("./vectors/credential.json", import.meta.url);

if (!existsSync(fileURLToPath(bindingsUrl))) {
  test("cross-language conformance (SKIPPED — contract not compiled)", { skip: true }, () => {});
} else {
  const { pureCircuits } = (await import(bindingsUrl.href)) as {
    pureCircuits: {
      deriveHolderKey(secret: Uint8Array): Uint8Array;
      computeLeaf(schema: bigint, cid: Uint8Array, holderKey: Uint8Array, by: bigint, jur: bigint, vu: bigint, rand: Uint8Array): Uint8Array;
      computeRequestCommitment(account: Uint8Array, nonce: Uint8Array, policyId: Uint8Array, epoch: bigint): Uint8Array;
      computeNullifier(secret: Uint8Array, policyId: Uint8Array, cid: Uint8Array): Uint8Array;
    };
  };

  const v = JSON.parse(readFileSync(fileURLToPath(vectorsUrl), "utf8")) as {
    inputs: { holderSecretHex: string; credentialIdHex: string; issuerRandomnessHex: string; requestNonceHex: string; schemaVersion: number; birthYear: number; jurisdictionCode: string; validUntilPolicyEpoch: number; xrplAddress: string; policyEpoch: number };
    expected: { holderKeyHex: string; credentialLeafHex: string; requestCommitmentHex: string; nullifierHex: string };
  };

  const secret = fromHex(v.inputs.holderSecretHex);
  const cid = fromHex(v.inputs.credentialIdHex);
  const rand = fromHex(v.inputs.issuerRandomnessHex);
  const nonce = fromHex(v.inputs.requestNonceHex);
  const holderKey = deriveHolderKey(secret);
  const account = xrplAddressToBytes32(v.inputs.xrplAddress);
  const jur = jurisdictionToUint(v.inputs.jurisdictionCode);
  const cred: PrivateCredential = {
    schemaVersion: v.inputs.schemaVersion,
    credentialId: cid,
    holderKey,
    birthYear: v.inputs.birthYear,
    jurisdictionCode: v.inputs.jurisdictionCode,
    validUntilPolicyEpoch: v.inputs.validUntilPolicyEpoch,
    issuerRandomness: rand,
  };

  const agree = (name: string, circuit: Uint8Array, ts: Uint8Array, vector: string) => {
    const c = toHex(circuit);
    assert.equal(c, toHex(ts), `${name}: circuit != TS`);
    assert.equal(c, vector, `${name}: circuit != golden vector`);
  };

  test("holder key: circuit == TS == vector", () => {
    agree("holderKey", pureCircuits.deriveHolderKey(secret), deriveHolderKey(secret), v.expected.holderKeyHex);
  });

  test("credential leaf (persistentCommit tuple): circuit == TS == vector", () => {
    const circuit = pureCircuits.computeLeaf(BigInt(v.inputs.schemaVersion), cid, holderKey, BigInt(v.inputs.birthYear), jur, BigInt(v.inputs.validUntilPolicyEpoch), rand);
    agree("credentialLeaf", circuit, credentialLeaf(cred), v.expected.credentialLeafHex);
  });

  test("request commitment (persistentHash tuple): circuit == TS == vector", () => {
    const circuit = pureCircuits.computeRequestCommitment(account, nonce, POLICY_ID32, BigInt(v.inputs.policyEpoch));
    const ts = requestCommitment({ xrplAccountId32: account, requestNonce: nonce, policyEpoch: v.inputs.policyEpoch });
    agree("requestCommitment", circuit, ts, v.expected.requestCommitmentHex);
  });

  test("nullifier: circuit == TS == vector", () => {
    const circuit = pureCircuits.computeNullifier(secret, POLICY_ID32, cid);
    agree("nullifier", circuit, nullifier({ holderSecret: secret, credentialId: cid }), v.expected.nullifierHex);
  });
}
