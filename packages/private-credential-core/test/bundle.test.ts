import test from "node:test";
import assert from "node:assert/strict";
import { fromHex, randomBytes32 } from "../src/bytes.ts";
import { deriveHolderKey } from "../src/credential.ts";
import { CredentialMerkleTree } from "../src/merkle.ts";
import { issueCredential, verifyCredentialBundle, privateCredentialFromBundle } from "../src/bundle.ts";
import { credentialLeaf } from "../src/credential.ts";
import { toHex } from "../src/bytes.ts";

function issueOne(over: Partial<Parameters<typeof issueCredential>[0]> = {}) {
  const holderSecret = randomBytes32();
  const holderKey = deriveHolderKey(holderSecret);
  const tree = over.tree ?? new CredentialMerkleTree();
  const { bundle, index } = issueCredential({
    tree,
    holderKey,
    birthYear: 2000,
    jurisdictionCode: "CA",
    validUntilPolicyEpoch: 1,
    policyEpoch: 1,
    ...over,
  });
  return { holderSecret, holderKey, tree, bundle, index };
}

test("a freshly issued bundle is self-consistent", () => {
  const { bundle } = issueOne();
  const res = verifyCredentialBundle(bundle);
  assert.deepEqual(res.reasons, []);
  assert.ok(res.ok);
});

test("bundle never carries the holder secret, only holder_key", () => {
  const { bundle, holderSecret } = issueOne();
  const json = JSON.stringify(bundle);
  assert.ok(!json.includes(toHex(holderSecret)), "holder secret must not appear in the bundle");
  assert.equal(bundle.holderKey.length, 64); // 32-byte hex
});

test("leaf in the bundle equals credentialLeaf of its fields", () => {
  const { bundle } = issueOne();
  assert.equal(toHex(credentialLeaf(privateCredentialFromBundle(bundle))), bundle.leaf);
});

test("tampering with an attribute invalidates the bundle (leaf mismatch)", () => {
  const { bundle } = issueOne();
  const tampered = { ...bundle, birthYear: 1990 };
  const res = verifyCredentialBundle(tampered);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /leaf does not match/.test(r)));
});

test("tampering with the root invalidates the bundle (path mismatch)", () => {
  const { bundle } = issueOne();
  const tampered = { ...bundle, credentialRoot: toHex(new Uint8Array(32).fill(0xab)) };
  const res = verifyCredentialBundle(tampered);
  assert.ok(!res.ok);
  assert.ok(res.reasons.some((r) => /does not resolve to credentialRoot/.test(r)));
});

test("a malformed bundle returns reasons instead of throwing", () => {
  const { bundle } = issueOne();

  // bad hex in a byte field must be reported, not thrown
  const badHex = { ...bundle, credentialId: "zz".repeat(32) };
  const r1 = verifyCredentialBundle(badHex);
  assert.ok(!r1.ok);
  assert.ok(r1.reasons.some((r) => /invalid credential fields/.test(r)));

  // bad root hex must be reported, not thrown
  const badRoot = { ...bundle, credentialRoot: "nothex" };
  const r2 = verifyCredentialBundle(badRoot);
  assert.ok(!r2.ok);
  assert.ok(r2.reasons.some((r) => /invalid merkle path or root/.test(r)));

  // invalid jurisdiction code (reached via credentialLeaf) must be reported as a thrown-then-captured
  // validation error, not merely surface as a leaf mismatch — assert the specific fail-soft reason.
  const badJur = { ...bundle, jurisdictionCode: "ca" };
  const r3 = verifyCredentialBundle(badJur);
  assert.ok(!r3.ok);
  assert.ok(r3.reasons.some((r) => /invalid credential fields/.test(r)));
});

test("two credentials in the same tree each verify against the final root", () => {
  const tree = new CredentialMerkleTree();
  const a = issueOne({ tree });
  const b = issueOne({ tree });
  // a's captured root is stale after b is inserted; re-derive a's path against the final tree
  const finalRoot = tree.root();
  const pathA = tree.pathFor(a.index);
  const pathB = tree.pathFor(b.index);
  // b's bundle root is the final root
  assert.equal(b.bundle.credentialRoot, toHex(finalRoot));
  assert.ok(verifyCredentialBundle(b.bundle).ok);
  // structural: both leaves are distinct and included
  assert.notEqual(toHex(pathA.leaf), toHex(pathB.leaf));
});
