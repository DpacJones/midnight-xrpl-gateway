// Domain-separated hashing, built on the public @midnight-ntwrk/compact-runtime primitives so
// outputs match the Compact circuit by construction. This is an INDEPENDENT implementation
// (Codex ruling, option b): it does NOT import generated contract bindings. The compiled
// pureCircuits.* are the conformance oracle used only in tests.
//
//   - persistentHash(type, value)            -> Bytes<32>
//   - persistentCommit(type, value, opening) -> Bytes<32>   (32-byte opening; ruling D1)
//
// Tags are pad(32, "ascii") — UTF-8 right-zero-padded. Integer fields are hashed with their
// native Compact Uint<N> type inside a heterogeneous tuple (NOT widened to Bytes<32>).

import { CompactTypeBytes, CompactTypeUnsignedInteger, CompactTypeVector, persistentHash, persistentCommit } from "@midnight-ntwrk/compact-runtime";
import { DOMAIN, type DomainName } from "./constants.ts";
import { assertLen } from "./bytes.ts";

/** pad(32, s): UTF-8 bytes of s, right-zero-padded to 32. Throws if s exceeds 32 bytes. */
export function pad32(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > 32) throw new Error(`tag ${JSON.stringify(s)} is ${bytes.length} bytes; pad(32) requires <= 32`);
  const out = new Uint8Array(32);
  out.set(bytes);
  return out;
}

/** Public Bytes<32> descriptor. */
export const bytes32 = new CompactTypeBytes(32);

/** Compact Uint<bits> descriptor: max value 2^bits-1, byte length bits/8. */
export function uint(bits: number): CompactTypeUnsignedInteger {
  if (bits % 8 !== 0 || bits <= 0) throw new Error(`uint width must be a positive multiple of 8, got ${bits}`);
  return new CompactTypeUnsignedInteger((1n << BigInt(bits)) - 1n, bits / 8);
}

/**
 * Generic heterogeneous-tuple CompactType, composed from public element descriptors. Mirrors
 * the compiler-generated tuple class exactly: alignment() and toValue() concatenate element
 * results (array concat is associative, so the nesting the compiler emits is equivalent).
 */
interface ElementType {
  alignment(): unknown[];
  fromValue(v: unknown): unknown;
  toValue(v: unknown): unknown[];
}

class CompactTuple {
  private readonly elements: ElementType[];
  constructor(elements: ElementType[]) {
    this.elements = elements;
  }
  alignment(): unknown[] {
    return this.elements.reduce<unknown[]>((acc, e) => acc.concat(e.alignment()), []);
  }
  fromValue(value: unknown): unknown[] {
    return this.elements.map((e) => e.fromValue(value));
  }
  toValue(tuple: unknown[]): unknown[] {
    return this.elements.reduce<unknown[]>((acc, e, i) => acc.concat(e.toValue(tuple[i])), []);
  }
}

/** Field of a typed tuple: a runtime descriptor + its value (Uint8Array for bytes, bigint for uints). */
export interface TupleField {
  type: ElementType;
  value: unknown;
}

/** persistentHash over a homogeneous Vector<n, Bytes<32>>. Every element must be 32 bytes. */
export function hashVec(elements: Uint8Array[]): Uint8Array {
  if (elements.length === 0) throw new Error("hashVec: need at least one element");
  elements.forEach((e, i) => assertLen(e, 32, `element[${i}]`));
  return persistentHash(new CompactTypeVector(elements.length, bytes32) as never, elements as never);
}

/** persistentHash over a heterogeneous tuple of native Compact types. */
export function hashTuple(fields: TupleField[]): Uint8Array {
  const t = new CompactTuple(fields.map((f) => f.type));
  return persistentHash(t as never, fields.map((f) => f.value) as never);
}

/** persistentCommit over a heterogeneous tuple with a 32-byte opening (ruling D1). */
export function commitTuple(fields: TupleField[], opening: Uint8Array): Uint8Array {
  assertLen(opening, 32, "opening");
  const t = new CompactTuple(fields.map((f) => f.type));
  return persistentCommit(t as never, fields.map((f) => f.value) as never, opening);
}

/** Canonical Bytes<32> domain tags via pad(32, ...). */
export const TAG: Record<DomainName, Uint8Array> = Object.freeze({
  HOLDER: pad32(DOMAIN.HOLDER),
  CRED_LEAF: pad32(DOMAIN.CRED_LEAF),
  REQUEST: pad32(DOMAIN.REQUEST),
  NULLIFIER: pad32(DOMAIN.NULLIFIER),
  ADMIN: pad32(DOMAIN.ADMIN),
  MERKLE_NODE: pad32(DOMAIN.MERKLE_NODE),
  POLICY: pad32(DOMAIN.POLICY),
});

/** Public 32-byte policy identifier (= the POLICY tag). */
export const POLICY_ID32: Uint8Array = TAG.POLICY;
