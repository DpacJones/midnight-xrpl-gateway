import test from "node:test";
import assert from "node:assert/strict";
import { toHex, fromHex, randomBytes32, assertLen } from "../src/bytes.ts";

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
