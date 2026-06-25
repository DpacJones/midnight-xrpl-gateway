// Shared protocol constants. These are load-bearing: the Compact circuit and every
// TypeScript caller (browser, tests, gateway) must agree on them byte-for-byte.
// See docs/PROTOCOL_DECISIONS.md for the governing rulings.

/**
 * Versioned domain separators (Mission Profile §8.1). Every hash/commit MUST be tagged
 * with exactly one of these. Never reuse a hash output for two semantic purposes.
 *
 * Stored as ASCII strings here; the canonical *byte* encoding fed into a hash is defined
 * alongside the hashing primitives (next Phase-1 slice) so it can be cross-checked against
 * the circuit. Do not hash these ad hoc — go through the shared helper.
 */
export const DOMAIN = {
  HOLDER: "atlantis:mxrpl:holder:v1",
  CREDENTIAL_LEAF: "atlantis:mxrpl:credential-leaf:v1",
  REQUEST: "atlantis:mxrpl:request:v1",
  NULLIFIER: "atlantis:mxrpl:nullifier:v1",
  ADMIN: "atlantis:mxrpl:admin:v1",
} as const;

export type DomainName = keyof typeof DOMAIN;

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
 * v1 synthetic policy parameters (Mission Profile §8.5). SYNTHETIC DEMO DATA — not KYC.
 * The UI must label these as such.
 */
export const POLICY_V1 = {
  policyId: "atlantis:mxrpl:policy:adult-allowed-jurisdiction:v1",
  schemaVersion: 1,
  adultCutoffYear: 2008,
  /** Allowed jurisdiction as an ISO-3166-1 alpha-2 code; "CA" for the first demo. */
  allowedJurisdiction: "CA",
  currentPolicyEpoch: 1,
} as const;
