import test from "node:test";
import assert from "node:assert/strict";
import { toHex, fromHex } from "../src/bytes.ts";
import {
  CredentialMerkleTree,
  nodeHash,
  merklePathRoot,
  verifyMerklePath,
  serializeMerklePath,
  deserializeMerklePath,
  ZERO32,
  type MerklePath,
} from "../src/merkle.ts";

const leaf = (b: number) => new Uint8Array(32).fill(b);

test("empty tree root is deterministic and equals the all-zero subtree root", () => {
  const a = new CredentialMerkleTree(4).root();
  const b = new CredentialMerkleTree(4).root();
  assert.equal(toHex(a), toHex(b));
  // root of an empty depth-1 tree = nodeHash(0,0)
  assert.equal(toHex(new CredentialMerkleTree(1).root()), toHex(nodeHash(ZERO32, ZERO32)));
});

test("every inserted leaf has a path that verifies against the root", () => {
  const t = new CredentialMerkleTree(8);
  const leaves = [leaf(1), leaf(2), leaf(3), leaf(4), leaf(5)];
  leaves.forEach((l) => t.insert(l));
  const root = t.root();
  for (let i = 0; i < leaves.length; i++) {
    const path = t.pathFor(i);
    assert.equal(path.entries.length, 8, "path length == depth");
    assert.ok(verifyMerklePath(path, root), `leaf ${i} verifies`);
    assert.equal(toHex(merklePathRoot(path)), toHex(root));
  }
});

test("a tampered leaf or sibling breaks verification", () => {
  const t = CredentialMerkleTree.from([leaf(1), leaf(2), leaf(3)], 6);
  const root = t.root();
  const good = t.pathFor(1);

  const badLeaf: MerklePath = { ...good, leaf: leaf(9) };
  assert.ok(!verifyMerklePath(badLeaf, root));

  const badSibling: MerklePath = { ...good, entries: good.entries.map((e, i) => (i === 0 ? { ...e, sibling: leaf(0xaa) } : e)) };
  assert.ok(!verifyMerklePath(badSibling, root));

  const flippedDir: MerklePath = { ...good, entries: good.entries.map((e, i) => (i === 0 ? { ...e, goesLeft: !e.goesLeft } : e)) };
  assert.ok(!verifyMerklePath(flippedDir, root));
});

test("root changes when a leaf is added (revocation/rotation semantics)", () => {
  const t = new CredentialMerkleTree(6);
  t.insert(leaf(1));
  const r1 = toHex(t.root());
  t.insert(leaf(2));
  const r2 = toHex(t.root());
  assert.notEqual(r1, r2);
});

test("a path from one tree does not verify against a different root", () => {
  const t1 = CredentialMerkleTree.from([leaf(1), leaf(2)], 5);
  const t2 = CredentialMerkleTree.from([leaf(1), leaf(7)], 5);
  const path0 = t1.pathFor(0);
  assert.ok(verifyMerklePath(path0, t1.root()));
  assert.ok(!verifyMerklePath(path0, t2.root())); // sibling differs -> different root
});

test("path serialization round-trips", () => {
  const t = CredentialMerkleTree.from([leaf(1), leaf(2), leaf(3)], 8);
  const path = t.pathFor(2);
  const round = deserializeMerklePath(serializeMerklePath(path));
  assert.equal(toHex(round.leaf), toHex(path.leaf));
  assert.equal(round.index, path.index);
  assert.deepEqual(
    round.entries.map((e) => [toHex(e.sibling), e.goesLeft]),
    path.entries.map((e) => [toHex(e.sibling), e.goesLeft]),
  );
  assert.ok(verifyMerklePath(round, t.root()));
});

test("deserialize rejects malformed entries", () => {
  const t = CredentialMerkleTree.from([leaf(1)], 4);
  const s = serializeMerklePath(t.pathFor(0));
  assert.throws(() => deserializeMerklePath({ ...s, leaf: "00" }), /32 bytes/);
});

test("insert validates leaf length and index bounds", () => {
  const t = new CredentialMerkleTree(4);
  assert.throws(() => t.insert(fromHex("00")), /32 bytes/);
  assert.throws(() => t.pathFor(0), /out of range/); // nothing inserted yet
});
