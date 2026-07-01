// Low-level byte helpers. Universal (Node + browser): uses the global Web Crypto and
// only standard typed-array operations. Fixed lengths and explicit big-endian everywhere.

import { BYTE_LENGTHS } from "./constants.ts";

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex string must have even length, got ${hex.length}`);
  // Reject any non-hex character up front. Number.parseInt would otherwise silently accept a
  // malformed pair (e.g. "1g" -> 0x01, "-5" -> a wrapped byte), corrupting the decoded value
  // instead of failing. Every byte field here is security-relevant, so fail closed.
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error("invalid hex: string contains a non-hex character");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Assert a byte array is exactly `len` long (default 32). Returns it for chaining. */
export function assertLen(bytes: Uint8Array, len = BYTE_LENGTHS.BYTES32, label = "value"): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${label} must be a Uint8Array`);
  if (bytes.length !== len) throw new Error(`${label} must be ${len} bytes, got ${bytes.length}`);
  return bytes;
}

/** Cryptographically secure 32-byte value (holder secret, credential id, nonce, randomness). */
export function randomBytes32(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(BYTE_LENGTHS.SECRET));
}
