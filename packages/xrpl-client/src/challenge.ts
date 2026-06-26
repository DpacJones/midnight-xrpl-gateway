// XRPL account-binding challenge (Mission Profile §10).
//
// To prove control of the subject XRPL account WITHOUT submitting anything, the user signs an
// intentionally NON-SUBMITTABLE self-payment whose memo binds the Midnight request. The gateway
// verifies the signature CRYPTOGRAPHICALLY (not just decodes it — this is the class of bug the
// Atlantis login-signature vuln was) and checks every field is exactly the expected challenge.
//
// Canonical challenge (all fields fixed; any deviation is rejected):
//   TransactionType: Payment
//   Account == Destination == subject
//   Amount: "1"          Fee: "1"   Sequence: 0   Flags: 0   LastLedgerSequence: 1
//   Memos: [{ Memo: { MemoType: hex("MXRPL_V1"),
//                     MemoData: policyId32(32) || epoch(2 BE) || requestCommitment(32) || requestNonce(32) } }]
//
// The LastLedgerSequence:1 + Sequence:0 guarantee it can never be a valid submittable tx.

import { decode, deriveAddress, verifySignature, convertStringToHex } from "xrpl";
import { toHex, fromHex, assertLen } from "@mxrpl/private-credential-core";

export const MEMO_TYPE = "MXRPL_V1";
export const MEMO_TYPE_HEX = convertStringToHex(MEMO_TYPE).toUpperCase();
const MEMO_DATA_LEN = 32 + 2 + 32 + 32; // 98 bytes

export interface ChallengeFields {
  account: string; // classic r... address
  policyId32: Uint8Array; // Bytes<32>
  policyEpoch: number; // Uint<16>
  requestCommitment: Uint8Array; // Bytes<32>
  requestNonce: Uint8Array; // Bytes<32>
}

/** Encode the memo payload: policyId || epoch(2 BE) || requestCommitment || requestNonce. */
function encodeMemoData(f: ChallengeFields): string {
  assertLen(f.policyId32, 32, "policyId32");
  assertLen(f.requestCommitment, 32, "requestCommitment");
  assertLen(f.requestNonce, 32, "requestNonce");
  if (!Number.isInteger(f.policyEpoch) || f.policyEpoch < 0 || f.policyEpoch > 0xffff) {
    throw new Error(`policyEpoch must fit Uint<16>, got ${f.policyEpoch}`);
  }
  const buf = new Uint8Array(MEMO_DATA_LEN);
  buf.set(f.policyId32, 0);
  buf[32] = (f.policyEpoch >> 8) & 0xff;
  buf[33] = f.policyEpoch & 0xff;
  buf.set(f.requestCommitment, 34);
  buf.set(f.requestNonce, 66);
  return toHex(buf).toUpperCase();
}

/**
 * Build the unsigned canonical challenge transaction. The user signs this locally with their
 * XRPL wallet (e.g. `wallet.sign(buildChallenge(...))`); the resulting tx_blob is the
 * `signedChallengeBlob` handed to the gateway. It is NEVER submitted.
 */
export function buildChallenge(f: ChallengeFields): Record<string, unknown> {
  return {
    TransactionType: "Payment",
    Account: f.account,
    Destination: f.account,
    Amount: "1",
    Fee: "1",
    Sequence: 0,
    Flags: 0,
    LastLedgerSequence: 1,
    Memos: [{ Memo: { MemoType: MEMO_TYPE_HEX, MemoData: encodeMemoData(f) } }],
  };
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
  /** The verified subject account (only meaningful when ok). */
  account?: string;
}

// Exactly the fields a signed canonical challenge may contain. Anything else is rejected so an
// attacker cannot smuggle meaning (e.g. a real Destination/Amount) past the checks.
const ALLOWED_FIELDS = new Set([
  "TransactionType",
  "Account",
  "Destination",
  "Amount",
  "Fee",
  "Sequence",
  "Flags",
  "LastLedgerSequence",
  "Memos",
  "SigningPubKey",
  "TxnSignature",
]);

/**
 * Verify a signed challenge blob against the expected request. Fails closed: every check must pass.
 * The signer is always bound to `expected.account` (required) — the verified subject account.
 */
export function verifyChallenge(signedBlob: string, expected: ChallengeFields): VerifyResult {
  const reasons: string[] = [];
  const fail = (r: string): VerifyResult => ({ ok: false, reasons: [...reasons, r] });

  let tx: Record<string, unknown>;
  try {
    tx = decode(signedBlob) as Record<string, unknown>;
  } catch (e) {
    return fail(`undecodable blob: ${String((e as Error)?.message ?? e)}`);
  }

  // 1. cryptographic signature verification (NOT just a decode). Uses the tx's embedded
  //    SigningPubKey; combined with the derived-address check below this binds key -> account.
  if (typeof tx.TxnSignature !== "string" || typeof tx.SigningPubKey !== "string" || tx.SigningPubKey === "") {
    return fail("missing TxnSignature/SigningPubKey (unsigned)");
  }
  let sigValid = false;
  try {
    sigValid = verifySignature(signedBlob);
  } catch (e) {
    return fail(`signature verification threw: ${String((e as Error)?.message ?? e)}`);
  }
  if (!sigValid) return fail("invalid signature");

  // 2. signer key must derive to the Account (else sign-with-own-key-claim-other-account)
  let derived: string;
  try {
    derived = deriveAddress(tx.SigningPubKey as string);
  } catch (e) {
    return fail(`cannot derive address from SigningPubKey: ${String((e as Error)?.message ?? e)}`);
  }
  if (derived !== tx.Account) reasons.push("SigningPubKey does not derive to Account");

  // 3. exact canonical shape — every field pinned; deviations rejected
  for (const k of Object.keys(tx)) if (!ALLOWED_FIELDS.has(k)) reasons.push(`unexpected field: ${k}`);
  if (tx.TransactionType !== "Payment") reasons.push("TransactionType != Payment");
  if (tx.Account !== tx.Destination) reasons.push("Account != Destination");
  if (tx.Amount !== "1") reasons.push("Amount != 1");
  if (tx.Fee !== "1") reasons.push("Fee != 1");
  if ((tx.Flags ?? 0) !== 0) reasons.push("Flags != 0");
  if (tx.LastLedgerSequence !== 1) reasons.push("LastLedgerSequence != 1");
  if (tx.Sequence !== 0) reasons.push("Sequence != 0");

  // 4. account binding to the request (required)
  if (tx.Account !== expected.account) reasons.push("Account != expected account");

  // 5. memo binds policy_id, epoch, request_commitment, request_nonce
  reasons.push(...verifyMemo(tx, expected));

  return reasons.length === 0 ? { ok: true, reasons: [], account: tx.Account as string } : { ok: false, reasons };
}

function verifyMemo(tx: Record<string, unknown>, expected: ChallengeFields): string[] {
  const memos = tx.Memos as Record<string, unknown>[] | undefined;
  if (!Array.isArray(memos) || memos.length !== 1) return ["memo: expected exactly one memo"];
  // wrapper must be exactly { Memo: {...} } — no smuggled sibling keys
  const wrapper = memos[0];
  if (Object.keys(wrapper).length !== 1 || !("Memo" in wrapper)) return ["memo: wrapper must contain only Memo"];
  const m = wrapper.Memo as { MemoType?: string; MemoData?: string } & Record<string, unknown>;
  if (!m || typeof m.MemoType !== "string" || typeof m.MemoData !== "string") return ["memo: malformed"];
  // Memo must contain exactly MemoType + MemoData — reject MemoFormat or any extra field
  const mk = Object.keys(m);
  if (mk.length !== 2 || !mk.includes("MemoType") || !mk.includes("MemoData")) return ["memo: unexpected memo fields"];
  if (m.MemoType.toUpperCase() !== MEMO_TYPE_HEX) return ["memo: wrong MemoType"];

  let data: Uint8Array;
  try {
    data = fromHex(m.MemoData);
  } catch {
    return ["memo: MemoData not hex"];
  }
  if (data.length !== MEMO_DATA_LEN) return [`memo: MemoData must be ${MEMO_DATA_LEN} bytes, got ${data.length}`];

  const out: string[] = [];
  const policyId = data.slice(0, 32);
  const epoch = (data[32] << 8) | data[33];
  const commitment = data.slice(34, 66);
  const nonce = data.slice(66, 98);
  if (toHex(policyId) !== toHex(expected.policyId32)) out.push("memo: policy_id mismatch");
  if (epoch !== expected.policyEpoch) out.push("memo: policy_epoch mismatch");
  if (toHex(commitment) !== toHex(expected.requestCommitment)) out.push("memo: request_commitment mismatch");
  if (toHex(nonce) !== toHex(expected.requestNonce)) out.push("memo: request_nonce mismatch");
  return out;
}
