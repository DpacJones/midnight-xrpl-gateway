// Canonical XRPL AccountID <-> Bytes<32> encoding.
//
// Ruling D2 (Codex, docs/PROTOCOL_DECISIONS.md): when Bytes<32> is required, take the RAW
// 20-byte AccountID and LEFT-PAD it with twelve 0x00 bytes:
//
//     bytes32 = 00 00 ... (12 zero bytes) ... || <20-byte AccountID>
//
// No Base58 prefix, no 4-byte checksum, no XRPL field-length byte. The 20-byte AccountID is
// obtained from xrpl's decodeAccountID (do NOT hand-roll Base58Check).
//
// This is the ONE encoder. Browser, tests, and gateway all import it — no duplicate encoders.

import { decodeAccountID, encodeAccountID } from "xrpl";
import { BYTE_LENGTHS } from "./constants.ts";

const { ACCOUNT_ID, BYTES32 } = BYTE_LENGTHS;
const PAD = BYTES32 - ACCOUNT_ID; // 12

/**
 * Classic XRPL address (r...) -> canonical 32-byte representation.
 * Throws if the address is invalid or does not decode to exactly 20 bytes.
 */
export function xrplAddressToBytes32(classicAddress: string): Uint8Array {
  const accountId = decodeAccountID(classicAddress); // throws on invalid checksum/format
  if (accountId.length !== ACCOUNT_ID) {
    throw new Error(`AccountID must be ${ACCOUNT_ID} bytes, got ${accountId.length}`);
  }
  const out = new Uint8Array(BYTES32); // zero-filled -> the 12 high bytes are the left padding
  out.set(accountId, PAD); // place the 20 bytes in the low positions [12..32)
  return out;
}

/**
 * Canonical 32-byte representation -> classic XRPL address (r...).
 * Throws if the input is not 32 bytes or if the 12 high (padding) bytes are non-zero.
 */
export function bytes32ToXrplAddress(bytes32: Uint8Array): string {
  if (bytes32.length !== BYTES32) {
    throw new Error(`expected ${BYTES32} bytes, got ${bytes32.length}`);
  }
  for (let i = 0; i < PAD; i++) {
    if (bytes32[i] !== 0) {
      throw new Error(`non-zero padding at byte ${i}: AccountID must occupy the low ${ACCOUNT_ID} bytes`);
    }
  }
  const accountId = bytes32.slice(PAD); // low 20 bytes
  return encodeAccountID(Buffer.from(accountId));
}

/** Lowercase hex of a byte array (helper for vectors/logging). */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
