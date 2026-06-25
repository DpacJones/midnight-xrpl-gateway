import test from "node:test";
import assert from "node:assert/strict";
import { toHex, fromHex, uintToBytes32, randomBytes32, assertLen } from "../src/bytes.ts";

test("uintToBytes32: fixed big-endian vectors", () => {
  assert.equal(toHex(uintToBytes32(0)), "0".repeat(64));
  assert.equal(toHex(uintToBytes32(1)), "0".repeat(63) + "1");
  assert.equal(toHex(uintToBytes32(2000)), "0".repeat(60) + "07d0"); // 0x07D0, big-endian
  assert.equal(toHex(uintToBytes32((1n << 256n) - 1n)), "f".repeat(64));
  assert.equal(toHex(uintToBytes32(0x4341)), "0".repeat(60) + "4341"); // "CA"
});

test("uintToBytes32: rejects out-of-range / non-integer", () => {
  assert.throws(() => uintToBytes32(-1), /non-negative/);
  assert.throws(() => uintToBytes32(1n << 256n), /< 2\^256/);
  assert.throws(() => uintToBytes32(1.5), /not an integer/);
});

test("fromHex/toHex round-trip and validation", () => {
  const h = "00ff10aa" + "b".repeat(56);
  assert.equal(toHex(fromHex(h)), h);
  assert.throws(() => fromHex("abc"), /even length/);
  assert.throws(() => fromHex("zz"), /invalid hex/);
});

test("assertLen enforces exact length", () => {
  assert.equal(assertLen(new Uint8Array(32)).length, 32); // default 32 OK
  assert.equal(assertLen(new Uint8Array(20), 20).length, 20); // custom length OK
  assert.throws(() => assertLen(new Uint8Array(31)), /32 bytes/);
  assert.throws(() => assertLen(new Uint8Array(20)), /32 bytes/);
});

test("randomBytes32 is 32 bytes and not constant", () => {
  const a = randomBytes32();
  const b = randomBytes32();
  assert.equal(a.length, 32);
  assert.notEqual(toHex(a), toHex(b));
});
