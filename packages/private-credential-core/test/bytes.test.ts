import test from "node:test";
import assert from "node:assert/strict";
import { toHex, fromHex, randomBytes32, assertLen } from "../src/bytes.ts";

test("fromHex/toHex round-trip and validation", () => {
  const h = "00ff10aa" + "b".repeat(56);
  assert.equal(toHex(fromHex(h)), h);
  assert.throws(() => fromHex("abc"), /even length/);
  assert.throws(() => fromHex("zz"), /invalid hex/);
});

test("fromHex rejects malformed pairs instead of silently decoding them", () => {
  // Number.parseInt would accept these and produce the WRONG bytes (e.g. "1g" -> 0x01),
  // so a malformed field would silently become a different 32-byte value. These must throw.
  assert.throws(() => fromHex("1g"), /invalid hex/); // bad second nibble (used to give 0x01)
  assert.throws(() => fromHex("g1"), /invalid hex/); // bad first nibble
  assert.throws(() => fromHex("-5"), /invalid hex/); // sign char (used to wrap to 251)
  assert.throws(() => fromHex(" a"), /invalid hex/); // leading whitespace
  assert.throws(() => fromHex("0x10"), /invalid hex/); // 0x-prefixed input
  assert.equal(fromHex("").length, 0); // empty string is still a valid 0-byte value
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
