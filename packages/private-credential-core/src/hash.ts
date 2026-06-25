// Domain-separated hashing layer, built on the Midnight Compact runtime so every value here
// is IDENTICAL to what the Compact circuit computes (the cross-language vector contract).
//
//   - persistentHash(rtType, value)            -> Bytes<32>   (Mission Profile H(...))
//   - persistentCommit(rtType, value, opening) -> Bytes<32>   (ruling D1: leaf commitment)
//
// Both operate over a Compact Vector<n, Bytes<32>>. Every element MUST be exactly 32 bytes,
// so callers normalize scalars via uintToBytes32 and use 32-byte tags/keys/ids. The opening
// for persistentCommit is the 32-byte issuer randomness.

import { CompactTypeBytes, CompactTypeVector, persistentHash, persistentCommit } from "@midnight-ntwrk/compact-runtime";
import { DOMAIN_TAG32_HEX, POLICY_ID32_HEX, type DomainName } from "./constants.ts";
import { assertLen, fromHex } from "./bytes.ts";

const BYTES32 = new CompactTypeBytes(32);
const vecCache = new Map<number, CompactTypeVector<Uint8Array>>();
function vecType(n: number): CompactTypeVector<Uint8Array> {
  let t = vecCache.get(n);
  if (!t) {
    t = new CompactTypeVector(n, BYTES32);
    vecCache.set(n, t);
  }
  return t;
}

/** Canonical Bytes<32> domain tags (decoded once from the precomputed hex literals). */
export const TAG32: Record<DomainName, Uint8Array> = Object.freeze({
  HOLDER: fromHex(DOMAIN_TAG32_HEX.HOLDER),
  CREDENTIAL_LEAF: fromHex(DOMAIN_TAG32_HEX.CREDENTIAL_LEAF),
  REQUEST: fromHex(DOMAIN_TAG32_HEX.REQUEST),
  NULLIFIER: fromHex(DOMAIN_TAG32_HEX.NULLIFIER),
  ADMIN: fromHex(DOMAIN_TAG32_HEX.ADMIN),
});

/** Public 32-byte policy identifier. */
export const POLICY_ID32: Uint8Array = fromHex(POLICY_ID32_HEX);

/**
 * persistentHash over a Vector<n, Bytes<32>>. `elements[0]` is, by our convention, the
 * domain tag — but this helper simply hashes whatever 32-byte elements it is given.
 */
export function hashVec(elements: Uint8Array[]): Uint8Array {
  if (elements.length === 0) throw new Error("hashVec: need at least one element");
  elements.forEach((e, i) => assertLen(e, 32, `element[${i}]`));
  return persistentHash(vecType(elements.length), elements);
}

/**
 * persistentCommit over a Vector<n, Bytes<32>> with a 32-byte opening (ruling D1).
 * Used for the credential leaf so witness-derived inputs stay hidden.
 */
export function commitVec(elements: Uint8Array[], opening: Uint8Array): Uint8Array {
  if (elements.length === 0) throw new Error("commitVec: need at least one element");
  elements.forEach((e, i) => assertLen(e, 32, `element[${i}]`));
  assertLen(opening, 32, "opening");
  return persistentCommit(vecType(elements.length), elements, opening);
}
