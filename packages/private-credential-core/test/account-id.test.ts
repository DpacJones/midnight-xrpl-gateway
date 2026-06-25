import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { xrplAddressToBytes32, bytes32ToXrplAddress, toHex } from "../src/account-id.ts";

const vectorsPath = fileURLToPath(new URL("./vectors/account-id.json", import.meta.url));
const { vectors } = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
  vectors: { name: string; address: string; accountIdHex: string; bytes32Hex: string }[];
};

const fromHex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

test("fixed vectors: address -> Bytes<32> matches expected", () => {
  for (const v of vectors) {
    assert.equal(toHex(xrplAddressToBytes32(v.address)), v.bytes32Hex, `forward: ${v.name}`);
  }
});

test("fixed vectors: Bytes<32> -> address matches expected", () => {
  for (const v of vectors) {
    assert.equal(bytes32ToXrplAddress(fromHex(v.bytes32Hex)), v.address, `reverse: ${v.name}`);
  }
});

test("round-trip is identity for every vector", () => {
  for (const v of vectors) {
    assert.equal(bytes32ToXrplAddress(xrplAddressToBytes32(v.address)), v.address, v.name);
  }
});

test("encoding shape: 32 bytes, high 12 are zero, low 20 are the AccountID", () => {
  for (const v of vectors) {
    const b = xrplAddressToBytes32(v.address);
    assert.equal(b.length, 32, `length ${v.name}`);
    for (let i = 0; i < 12; i++) assert.equal(b[i], 0, `high pad byte ${i} ${v.name}`);
    assert.equal(toHex(b.slice(12)), v.accountIdHex, `low 20 = accountId ${v.name}`);
  }
});

test("rejects invalid classic address", () => {
  assert.throws(() => xrplAddressToBytes32("not-an-address"));
  assert.throws(() => xrplAddressToBytes32("rL6R6fce1bfTxgj1S7mxQ2f4EBonv6wbyX")); // bad checksum
  assert.throws(() => xrplAddressToBytes32(""));
});

test("rejects wrong-length Bytes<32> input", () => {
  assert.throws(() => bytes32ToXrplAddress(new Uint8Array(31)), /expected 32 bytes/);
  assert.throws(() => bytes32ToXrplAddress(new Uint8Array(33)), /expected 32 bytes/);
  assert.throws(() => bytes32ToXrplAddress(new Uint8Array(20)), /expected 32 bytes/);
});

test("rejects non-zero high padding (a 32-byte value that isn't a left-padded AccountID)", () => {
  const bad = fromHex("010000000000000000000000d80fa3cfe52e6d0f5b86e861904ba6e792887d46");
  assert.throws(() => bytes32ToXrplAddress(bad), /non-zero padding/);
  // padding byte at position 11 (just above the AccountID) must also be caught
  const bad2 = xrplAddressToBytes32(vectors[1].address).slice();
  bad2[11] = 0xff;
  assert.throws(() => bytes32ToXrplAddress(bad2), /non-zero padding/);
});
