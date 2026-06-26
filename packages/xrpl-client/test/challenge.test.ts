import test from "node:test";
import assert from "node:assert/strict";
import { Wallet, encode, decode } from "xrpl";
import { randomBytes32 } from "@mxrpl/private-credential-core";
import { buildChallenge, verifyChallenge } from "../src/challenge.ts";

const w = Wallet.generate();
const w2 = Wallet.generate();
const POLICY = randomBytes32();
const COMMIT = randomBytes32();
const NONCE = randomBytes32();

const fields = (account: string, over: Record<string, unknown> = {}) => ({
  account,
  policyId32: POLICY,
  policyEpoch: 1,
  requestCommitment: COMMIT,
  requestNonce: NONCE,
  ...over,
});

const sign = (tx: Record<string, unknown>, wallet = w) => wallet.sign(tx as never).tx_blob;

test("valid signed challenge verifies", () => {
  const exp = fields(w.classicAddress);
  const res = verifyChallenge(sign(buildChallenge(exp)), exp);
  assert.deepEqual(res.reasons, []);
  assert.ok(res.ok);
  assert.equal(res.account, w.classicAddress);
});

test("unsigned blob fails", () => {
  const exp = fields(w.classicAddress);
  const blob = encode(buildChallenge(exp) as never); // not signed -> no TxnSignature/SigningPubKey
  const res = verifyChallenge(blob, exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /unsigned/.test(r)));
});

test("wrong signing key (SigningPubKey does not derive to Account) fails", () => {
  // tx claims Account = w2, but is signed by w's key
  const exp = fields(w2.classicAddress);
  const blob = sign(buildChallenge(exp), w); // signer w, Account w2
  const res = verifyChallenge(blob, exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /does not derive to Account/.test(r)));
});

test("account mismatch vs expected fails", () => {
  const blob = sign(buildChallenge(fields(w.classicAddress)));
  const res = verifyChallenge(blob, fields(w2.classicAddress)); // expect a different account
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /Account != expected account/.test(r)));
});

test("destination mismatch fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.Destination = w2.classicAddress;
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /Account != Destination/.test(r)));
});

test("wrong amount fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.Amount = "2";
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /Amount != 1/.test(r)));
});

test("wrong LastLedgerSequence fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.LastLedgerSequence = 2;
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /LastLedgerSequence != 1/.test(r)));
});

test("wrong fee fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.Fee = "2";
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /Fee != 1/.test(r)));
});

test("non-zero flags fail", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.Flags = 131072; // tfPartialPayment — valid to sign, not part of the canonical challenge
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /Flags != 0/.test(r)));
});

test("extra nested memo field (MemoFormat) fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  (t.Memos as any)[0].Memo.MemoFormat = "74657874"; // hex("text")
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /unexpected memo fields/.test(r)));
});

test("modified memo after signing breaks the signature", () => {
  const exp = fields(w.classicAddress);
  const blob = sign(buildChallenge(exp));
  const tx = decode(blob) as any;
  const md: string = tx.Memos[0].Memo.MemoData;
  tx.Memos[0].Memo.MemoData = (md[0] === "0" ? "1" : "0") + md.slice(1); // flip first nibble
  const res = verifyChallenge(encode(tx), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /invalid signature/.test(r)));
});

test("unexpected field fails", () => {
  const exp = fields(w.classicAddress);
  const t = buildChallenge(exp);
  t.DestinationTag = 12345; // valid to sign, but not part of the canonical challenge
  const res = verifyChallenge(sign(t), exp);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /unexpected field: DestinationTag/.test(r)));
});

test("memo field mismatches fail (commitment / epoch / nonce / policy)", () => {
  const blob = sign(buildChallenge(fields(w.classicAddress)));
  assert.ok(verifyChallenge(blob, fields(w.classicAddress, { requestCommitment: randomBytes32() })).reasons.some((r) => /request_commitment mismatch/.test(r)));
  assert.ok(verifyChallenge(blob, fields(w.classicAddress, { policyEpoch: 2 })).reasons.some((r) => /policy_epoch mismatch/.test(r)));
  assert.ok(verifyChallenge(blob, fields(w.classicAddress, { requestNonce: randomBytes32() })).reasons.some((r) => /request_nonce mismatch/.test(r)));
  assert.ok(verifyChallenge(blob, fields(w.classicAddress, { policyId32: randomBytes32() })).reasons.some((r) => /policy_id mismatch/.test(r)));
});

test("nonce of wrong length is rejected at build time", () => {
  assert.throws(() => buildChallenge(fields(w.classicAddress, { requestNonce: new Uint8Array(16) })), /32 bytes/);
});
