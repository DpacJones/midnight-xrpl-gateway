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
  MERKLE_NODE: "atlantis:mxrpl:merkle-node:v1",
} as const;

export type DomainName = keyof typeof DOMAIN;

/**
 * Canonical Bytes<32> form of each domain separator and the v1 policy id, precomputed as
 *   tag32 = SHA-256(utf8(string))
 * Precomputed (not hashed at runtime) so the encoder is dependency-free and universal, and
 * so the Phase 2 Compact contract can embed the IDENTICAL 32-byte literals. The derivation
 * is documented here purely so it is auditable/reproducible — it is never recomputed live.
 *
 * To verify:  printf '%s' '<string>' | sha256sum
 */
export const DOMAIN_TAG32_HEX: Record<DomainName, string> = {
  HOLDER: "4b3352e8f86283a50bcf3fdcbb8556d0ca242155b10cbac62e334c08154051be",
  CREDENTIAL_LEAF: "d7a66fb47b42e9f1c43d93e9f5601dc5b1b5b8b11e535ab9c9d3eaa536a643e5",
  REQUEST: "0b8e975d0ba5286480f81f5dbac55a74b98ee912a9a7c9ef25c5abc2c8dbec7b",
  NULLIFIER: "cbe1f84fc626fca5a7a13fbf38f47bd95ff03e8a7d3fae9aaadd9749611a86cb",
  ADMIN: "8c3257337ed62ac89d65740ce44311275ee04a97ead5e39eba8e4f44005c6ee2",
  MERKLE_NODE: "6a2b695e150f20844e3539c9a39e31b280cb7a3331cf9f37fc3d8590cbb37b0f",
};

/** Fixed Merkle tree height (capacity 2^MERKLE_DEPTH leaves). The Phase 2 circuit uses the same. */
export const MERKLE_DEPTH = 16;

/** SHA-256(utf8(POLICY_V1.policyId)) as the public 32-byte policy identifier. */
export const POLICY_ID32_HEX = "89737c9bb3fff00a49072d5125e20935140b40937dc69c94063c1fac137ea751";

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
