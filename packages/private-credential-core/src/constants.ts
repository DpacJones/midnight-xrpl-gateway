// Shared protocol constants. Load-bearing: the Compact circuit and every TypeScript caller
// must agree on them byte-for-byte. The Compact declarations are normative; this TS is an
// independent implementation that must conform (see docs/PROTOCOL_DECISIONS.md, D3-corrected).

/**
 * Versioned domain separators (Mission Profile §8.1). Each is hashed as a Bytes<32> via
 * pad(32, string) — UTF-8, right-zero-padded to 32 bytes (the Compact `pad` builtin). Every
 * string MUST be <= 32 bytes. Never reuse a hash output for two semantic purposes.
 */
export const DOMAIN = {
  HOLDER: "atlantis:mxrpl:holder:v1", // 24
  CRED_LEAF: "atlantis:mxrpl:cred-leaf:v1", // 27
  REQUEST: "atlantis:mxrpl:request:v1", // 25
  NULLIFIER: "atlantis:mxrpl:nullifier:v1", // 27
  ADMIN: "atlantis:mxrpl:admin:v1", // 23
  MERKLE_NODE: "atlantis:mxrpl:merkle-node:v1", // 29
  /** The public v1 policy identifier (also a pad(32) tag). */
  POLICY: "atlantis:mxrpl:adult-ca:v1", // 26
} as const;

export type DomainName = keyof typeof DOMAIN;

/** Fixed Merkle tree height (capacity 2^MERKLE_DEPTH leaves). The Phase 2 circuit uses the same. */
export const MERKLE_DEPTH = 16;

/** Fixed byte lengths. Explicit everywhere — no implicit widening. */
export const BYTE_LENGTHS = {
  /** Raw XRPL AccountID (the 160-bit account identifier). */
  ACCOUNT_ID: 20,
  /** Canonical wide field used by the circuit for account + hashes. */
  BYTES32: 32,
  /** Holder secret, issuer randomness, request nonce. */
  SECRET: 32,
} as const;

/**
 * Compact Uint<N> bit-widths for the hashed credential fields (Codex-confirmed). The TS hashing
 * tuples and the circuit's persistentCommit/persistentHash tuple types use exactly these.
 */
export const FIELD_BITS = {
  schemaVersion: 8,
  birthYear: 16,
  jurisdiction: 16,
  policyEpoch: 16,
  validUntil: 16,
} as const;

/**
 * v1 synthetic policy parameters (Mission Profile §8.5). SYNTHETIC DEMO DATA — not KYC.
 * The UI must label these as such. The policy id is the DOMAIN.POLICY tag.
 */
export const POLICY_V1 = {
  policyId: DOMAIN.POLICY,
  schemaVersion: 1,
  adultCutoffYear: 2008,
  /** Allowed jurisdiction as an ISO-3166-1 alpha-2 code; "CA" for the first demo. */
  allowedJurisdiction: "CA",
  currentPolicyEpoch: 1,
} as const;
