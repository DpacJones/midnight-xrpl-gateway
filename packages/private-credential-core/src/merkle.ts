// Fixed-depth binary Merkle tree over Bytes<32> leaves, with persistentHash node hashing.
//
// DESIGN DECISION D4 (proposed; see docs/PROTOCOL_DECISIONS.md): v1 uses a custom Merkle tree
// rather than the Compact stdlib `MerkleTree` ADT. Our design builds the tree OFF-CHAIN at the
// issuer and publishes only the root; the circuit verifies membership against that published
// root. A custom tree keeps the TS and Compact node-hash identical by construction (both fold
// with persistentHash) and avoids fragile AlignedValue plumbing. Tradeoff: persistentHash is
// not circuit-cost-optimised, so a depth-16 proof costs ~16 persistentHash gadgets. If Codex
// prefers the stdlib ADT (field/transient hashing) for cost, that is a Phase 2 swap.
//
// Node hash:  H_node(l, r) = persistentHash([MERKLE_NODE_tag, l, r])
// Empty leaf: 32 zero bytes; empty subtree roots are precomputed per level.
// Convention: path entry `goesLeft = true` means the CURRENT node is the LEFT child, so the
// parent is H_node(current, sibling); otherwise H_node(sibling, current).

import { MERKLE_DEPTH } from "./constants.ts";
import { hashVec, TAG32 } from "./hash.ts";
import { assertLen, toHex, fromHex } from "./bytes.ts";

export const ZERO32: Uint8Array = new Uint8Array(32);

export interface MerklePathEntry {
  sibling: Uint8Array; // Bytes<32>
  goesLeft: boolean; // current node is the left child
}

export interface MerklePath {
  leaf: Uint8Array; // Bytes<32>
  index: number;
  entries: MerklePathEntry[]; // length == tree depth
}

/** Internal node hash. Domain-separated so a node can never be confused with a leaf. */
export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return hashVec([TAG32.MERKLE_NODE, left, right]);
}

/** empty[k] = root of an all-zero subtree of height k. empty[0] = ZERO32. */
function emptyRoots(depth: number): Uint8Array[] {
  const e: Uint8Array[] = [ZERO32];
  for (let k = 1; k <= depth; k++) e.push(nodeHash(e[k - 1], e[k - 1]));
  return e;
}

export class CredentialMerkleTree {
  readonly depth: number;
  private readonly leaves: Uint8Array[] = [];
  private readonly empties: Uint8Array[];

  constructor(depth: number = MERKLE_DEPTH) {
    if (!Number.isInteger(depth) || depth < 1 || depth > 32) throw new Error("depth must be an integer in [1, 32]");
    this.depth = depth;
    this.empties = emptyRoots(depth);
  }

  get capacity(): number {
    return 2 ** this.depth;
  }
  get size(): number {
    return this.leaves.length;
  }

  /** Append a leaf at the next index. Returns its index. */
  insert(leaf: Uint8Array): number {
    assertLen(leaf, 32, "leaf");
    if (this.leaves.length >= this.capacity) throw new Error("merkle tree is full");
    this.leaves.push(Uint8Array.from(leaf));
    return this.leaves.length - 1;
  }

  static from(leaves: Uint8Array[], depth: number = MERKLE_DEPTH): CredentialMerkleTree {
    const t = new CredentialMerkleTree(depth);
    for (const l of leaves) t.insert(l);
    return t;
  }

  /** Build all level arrays bottom-up; missing nodes default to the empty subtree root. */
  private buildLevels(): Uint8Array[][] {
    const levels: Uint8Array[][] = [this.leaves.slice()];
    for (let d = 0; d < this.depth; d++) {
      const cur = levels[d];
      const next: Uint8Array[] = [];
      const count = Math.ceil(cur.length / 2);
      for (let i = 0; i < count; i++) {
        const left = cur[2 * i] ?? this.empties[d];
        const right = cur[2 * i + 1] ?? this.empties[d];
        next.push(nodeHash(left, right));
      }
      levels.push(next);
    }
    return levels;
  }

  root(): Uint8Array {
    if (this.leaves.length === 0) return Uint8Array.from(this.empties[this.depth]);
    const levels = this.buildLevels();
    return Uint8Array.from(levels[this.depth][0] ?? this.empties[this.depth]);
  }

  /** Inclusion path for the leaf at `index`. */
  pathFor(index: number): MerklePath {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error(`leaf index ${index} out of range [0, ${this.leaves.length})`);
    }
    const levels = this.buildLevels();
    const entries: MerklePathEntry[] = [];
    let idx = index;
    for (let d = 0; d < this.depth; d++) {
      const cur = levels[d];
      const goesLeft = idx % 2 === 0;
      const siblingIdx = goesLeft ? idx + 1 : idx - 1;
      const sibling = cur[siblingIdx] ?? this.empties[d];
      entries.push({ sibling: Uint8Array.from(sibling), goesLeft });
      idx = Math.floor(idx / 2);
    }
    return { leaf: Uint8Array.from(this.leaves[index]), index, entries };
  }
}

/** Recompute the root implied by a leaf + inclusion path (the circuit does the same fold). */
export function merklePathRoot(path: MerklePath): Uint8Array {
  let cur = assertLen(path.leaf, 32, "leaf");
  for (const e of path.entries) {
    assertLen(e.sibling, 32, "sibling");
    cur = e.goesLeft ? nodeHash(cur, e.sibling) : nodeHash(e.sibling, cur);
  }
  return cur;
}

/** True iff the path proves the leaf is included under `root`. */
export function verifyMerklePath(path: MerklePath, root: Uint8Array): boolean {
  assertLen(root, 32, "root");
  return toHex(merklePathRoot(path)) === toHex(root);
}

// ---- serialization (handoff: "Merkle path serialization") ----

export interface SerializedMerklePath {
  leaf: string;
  index: number;
  entries: { sibling: string; goesLeft: boolean }[];
}

export function serializeMerklePath(p: MerklePath): SerializedMerklePath {
  return {
    leaf: toHex(p.leaf),
    index: p.index,
    entries: p.entries.map((e) => ({ sibling: toHex(e.sibling), goesLeft: e.goesLeft })),
  };
}

export function deserializeMerklePath(s: SerializedMerklePath): MerklePath {
  return {
    leaf: assertLen(fromHex(s.leaf), 32, "leaf"),
    index: s.index,
    entries: s.entries.map((e) => ({ sibling: assertLen(fromHex(e.sibling), 32, "sibling"), goesLeft: e.goesLeft })),
  };
}
