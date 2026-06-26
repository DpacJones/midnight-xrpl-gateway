// Credential field derivations — the off-circuit half of the cross-language contract.
// Each function has a Compact circuit counterpart (Phase 2) that produces the identical
// Bytes<32>; the compiled pureCircuits.* are the test oracle. Inputs are private witnesses;
// nothing here logs or persists secrets. Mission Profile §8.2–§8.8.

import { FIELD_BITS } from "./constants.ts";
import { assertLen } from "./bytes.ts";
import { hashVec, hashTuple, commitTuple, bytes32, uint, TAG, POLICY_ID32 } from "./hash.ts";

/** Assert a JS number is a non-negative integer that fits in Compact Uint<bits>. */
function assertUint(value: number, bits: number, label: string): bigint {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer, got ${value}`);
  if (value < 0) throw new Error(`${label} must be non-negative, got ${value}`);
  const v = BigInt(value);
  if (v > (1n << BigInt(bits)) - 1n) throw new Error(`${label}=${value} does not fit in Uint<${bits}>`);
  return v;
}

/** Logical private credential (Mission Profile §8.3). Synthetic demo attributes only. */
export interface PrivateCredential {
  schemaVersion: number;
  credentialId: Uint8Array; // Bytes<32>
  holderKey: Uint8Array; // Bytes<32> = H(holder, holderSecret)
  birthYear: number;
  jurisdictionCode: string; // ISO-3166-1 alpha-2, e.g. "CA"
  validUntilPolicyEpoch: number;
  issuerRandomness: Uint8Array; // Bytes<32> opening
}

/**
 * holder_key = persistentHash(Vector<2,Bytes<32>>, [HOLDER, holder_secret])   (§8.2)
 * Only holder_key is given to the issuer; the secret never leaves the user.
 */
export function deriveHolderKey(holderSecret: Uint8Array): Uint8Array {
  assertLen(holderSecret, 32, "holderSecret");
  return hashVec([TAG.HOLDER, holderSecret]);
}

/** Encode a 2-letter jurisdiction code as a big-endian uint16 (e.g. "CA" -> 0x4341 = 17217). */
export function jurisdictionToUint(code: string): bigint {
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`jurisdictionCode must be 2 uppercase letters, got ${JSON.stringify(code)}`);
  return (BigInt(code.charCodeAt(0)) << 8n) | BigInt(code.charCodeAt(1));
}

/**
 * credential_leaf = persistentCommit(
 *   [CRED_LEAF:Bytes32, schema:Uint8, credential_id:Bytes32, holder_key:Bytes32,
 *    birth_year:Uint16, jurisdiction:Uint16, valid_until:Uint16],
 *   opening = issuer_randomness)   (§8.4, ruling D1)
 */
export function credentialLeaf(cred: PrivateCredential): Uint8Array {
  assertLen(cred.credentialId, 32, "credentialId");
  assertLen(cred.holderKey, 32, "holderKey");
  assertLen(cred.issuerRandomness, 32, "issuerRandomness");
  const schema = assertUint(cred.schemaVersion, FIELD_BITS.schemaVersion, "schemaVersion");
  const birthYear = assertUint(cred.birthYear, FIELD_BITS.birthYear, "birthYear");
  const validUntil = assertUint(cred.validUntilPolicyEpoch, FIELD_BITS.validUntil, "validUntilPolicyEpoch");
  const jurisdiction = jurisdictionToUint(cred.jurisdictionCode); // fits Uint<16> by construction
  return commitTuple(
    [
      { type: bytes32, value: TAG.CRED_LEAF },
      { type: uint(FIELD_BITS.schemaVersion), value: schema },
      { type: bytes32, value: cred.credentialId },
      { type: bytes32, value: cred.holderKey },
      { type: uint(FIELD_BITS.birthYear), value: birthYear },
      { type: uint(FIELD_BITS.jurisdiction), value: jurisdiction },
      { type: uint(FIELD_BITS.validUntil), value: validUntil },
    ],
    cred.issuerRandomness,
  );
}

/**
 * request_commitment = persistentHash(
 *   [REQUEST:Bytes32, xrpl_account_id_32:Bytes32, request_nonce:Bytes32, policy_id:Bytes32,
 *    policy_epoch:Uint16])   (§8.7)
 * Binds the receipt to one XRPL account without publishing the address on Midnight.
 */
export function requestCommitment(args: {
  xrplAccountId32: Uint8Array;
  requestNonce: Uint8Array;
  policyEpoch: number;
  policyId32?: Uint8Array;
}): Uint8Array {
  assertLen(args.xrplAccountId32, 32, "xrplAccountId32");
  assertLen(args.requestNonce, 32, "requestNonce");
  const policyId32 = args.policyId32 ?? POLICY_ID32;
  assertLen(policyId32, 32, "policyId32");
  const epoch = assertUint(args.policyEpoch, FIELD_BITS.policyEpoch, "policyEpoch");
  return hashTuple([
    { type: bytes32, value: TAG.REQUEST },
    { type: bytes32, value: args.xrplAccountId32 },
    { type: bytes32, value: args.requestNonce },
    { type: bytes32, value: policyId32 },
    { type: uint(FIELD_BITS.policyEpoch), value: epoch },
  ]);
}

/**
 * nullifier = persistentHash(Vector<4,Bytes<32>>, [NULLIFIER, holder_secret, policy_id, credential_id])  (§8.8)
 * One private credential -> one XRPL credential under one policy.
 */
export function nullifier(args: { holderSecret: Uint8Array; credentialId: Uint8Array; policyId32?: Uint8Array }): Uint8Array {
  assertLen(args.holderSecret, 32, "holderSecret");
  assertLen(args.credentialId, 32, "credentialId");
  const policyId32 = args.policyId32 ?? POLICY_ID32;
  assertLen(policyId32, 32, "policyId32");
  return hashVec([TAG.NULLIFIER, args.holderSecret, policyId32, args.credentialId]);
}
