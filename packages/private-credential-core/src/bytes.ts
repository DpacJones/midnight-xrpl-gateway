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
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex at byte ${i}`);
    out[i] = byte;
  }
  return out;
}

/** Assert a byte array is exactly `len` long (default 32). Returns it for chaining. */
export function assertLen(bytes: Uint8Array, len = BYTE_LENGTHS.BYTES32, label = "value"): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${label} must be a Uint8Array`);
  if (bytes.length !== len) throw new Error(`${label} must be ${len} bytes, got ${bytes.length}`);
  return bytes;
}

/**
 * Canonical fixed-width encoding of a non-negative integer to Bytes<32>, big-endian.
 * This is THE integer encoding rule the Compact circuit must mirror (explicit endianness,
 * fixed length). Throws on negative or >= 2^256.
 */
export function uintToBytes32(value: bigint | number): Uint8Array {
  let v = typeof value === "number" ? BigInt(value) : value;
  if (typeof value === "number" && !Number.isInteger(value)) throw new Error(`uintToBytes32: ${value} is not an integer`);
  if (v < 0n) throw new Error(`uintToBytes32: value must be non-negative, got ${v}`);
  if (v >= 1n << 256n) throw new Error(`uintToBytes32: value must be < 2^256`);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Cryptographically secure 32-byte value (holder secret, credential id, nonce, randomness). */
export function randomBytes32(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(BYTE_LENGTHS.SECRET));
}
