// Credential field derivations — the off-circuit half of the cross-language contract.
// Every function here has a Compact circuit counterpart (Phase 2) that must produce the
// identical Bytes<32>. Inputs are private witnesses; nothing here logs or persists secrets.
//
// Mission Profile §8.2–§8.8.

import { assertLen, uintToBytes32 } from "./bytes.ts";
import { hashVec, commitVec, TAG32, POLICY_ID32 } from "./hash.ts";

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
 * holder_key = H(domain_holder, holder_secret)   (§8.2)
 * Only holder_key is given to the issuer; the secret never leaves the user.
 */
export function deriveHolderKey(holderSecret: Uint8Array): Uint8Array {
  assertLen(holderSecret, 32, "holderSecret");
  return hashVec([TAG32.HOLDER, holderSecret]);
}

/**
 * Encode a 2-letter jurisdiction code as a big-endian integer (e.g. "CA" -> 0x4341).
 * This is the canonical numeric form the circuit compares against allowed_jurisdiction.
 */
export function jurisdictionToUint(code: string): bigint {
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`jurisdictionCode must be 2 uppercase letters, got ${JSON.stringify(code)}`);
  return (BigInt(code.charCodeAt(0)) << 8n) | BigInt(code.charCodeAt(1));
}

/**
 * credential_leaf = Commit(domain_credential_leaf, schema_version, credential_id, holder_key,
 *                          birth_year, jurisdiction_code, valid_until_policy_epoch;
 *                          issuer_randomness)   (§8.4, ruling D1: persistentCommit)
 */
export function credentialLeaf(cred: PrivateCredential): Uint8Array {
  assertLen(cred.credentialId, 32, "credentialId");
  assertLen(cred.holderKey, 32, "holderKey");
  assertLen(cred.issuerRandomness, 32, "issuerRandomness");
  return commitVec(
    [
      TAG32.CREDENTIAL_LEAF,
      uintToBytes32(cred.schemaVersion),
      cred.credentialId,
      cred.holderKey,
      uintToBytes32(cred.birthYear),
      uintToBytes32(jurisdictionToUint(cred.jurisdictionCode)),
      uintToBytes32(cred.validUntilPolicyEpoch),
    ],
    cred.issuerRandomness,
  );
}

/**
 * request_commitment = H(domain_request, xrpl_account_id_32, request_nonce, policy_id,
 *                        current_policy_epoch)   (§8.7)
 * Binds the eligibility receipt to one XRPL account without publishing the address on Midnight.
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
  return hashVec([TAG32.REQUEST, args.xrplAccountId32, args.requestNonce, policyId32, uintToBytes32(args.policyEpoch)]);
}

/**
 * nullifier = H(domain_nullifier, holder_secret, policy_id, credential_id)   (§8.8)
 * One private credential -> one XRPL credential under one policy.
 */
export function nullifier(args: { holderSecret: Uint8Array; credentialId: Uint8Array; policyId32?: Uint8Array }): Uint8Array {
  assertLen(args.holderSecret, 32, "holderSecret");
  assertLen(args.credentialId, 32, "credentialId");
  const policyId32 = args.policyId32 ?? POLICY_ID32;
  assertLen(policyId32, 32, "policyId32");
  return hashVec([TAG32.NULLIFIER, args.holderSecret, policyId32, args.credentialId]);
}
