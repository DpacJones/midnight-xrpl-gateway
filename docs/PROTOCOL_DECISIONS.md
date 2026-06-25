# Protocol Decisions (load-bearing encoding rules)

Decisions the Compact circuit and the TypeScript core must agree on byte-for-byte. Changing any of these after
Phase 1/2 lock is the expensive kind of change, so they are recorded here as the single source of truth.

## D1 — Credential leaf commitment: `persistentCommit`
**Ruling (Codex, 2026-06-24):** Use `persistentCommit` for the credential leaf, not `persistentHash`.
- It is the primitive explicitly designed for persistent-state commitments and accepts a 32-byte opening.
- `persistentHash` is **not** considered sufficient to hide witness-derived inputs under Compact's disclosure model.
- Mission Profile §8.4 left this open; this ruling closes it.
- Source: Midnight standard library — https://docs.midnight.network/compact/standard-library/exports

## D2 — XRPL AccountID → `Bytes<32>` widening: left-pad with 12 zero bytes
**Ruling (Codex, 2026-06-24):** When `Bytes<32>` is required, take the **raw 20-byte AccountID** and **left-pad**
it with twelve `0x00` bytes → `00·00·…(12)…·<20-byte AccountID>`.
- Do **not** include the Base58 prefix, the 4-byte checksum, or any XRPL field-length byte.
- Raw `Bytes<20>` would be simpler, but left-padding is the canonical widening rule; prefer it.
- **Add fixed test vectors** for this encoding (both directions).
- Source: XRPL binary AccountID format — https://xrpl.org/docs/references/protocol/binary-format (AccountID fields)

### Implementation notes for Phase 1
- One shared encoder used by browser, tests, and gateway (Mission Profile §8.6, handoff §1).
- Derive the 20-byte AccountID from the classic address by Base58Check-decoding and stripping the `0x00` type
  prefix + 4-byte checksum (xrpl's `decodeAccountID` returns exactly the 20 raw bytes — use it, do not hand-roll).
- Vector set must include: a known address ↔ its 20-byte AccountID ↔ its left-padded `Bytes<32>`, plus
  invalid-length inputs that must throw.

## D3 — CORRECTION PENDING (Phase 2 grounding, 2026-06-25)
Reading the proven Compact pattern (`NftZk.compact` + its generated bindings) shows the Phase 1 encoding guesses
below do **not** match how Compact actually hashes. Correcting before the circuit locks:
- **Domain tags:** Compact uses `pad(32, "short-string")` = UTF-8 **right-zero-padded** to 32 bytes, NOT
  `sha256(utf8)`. ⇒ shorten the two >32-byte tags (`credential-leaf`, `policy-id`) and switch TS to `pad32`.
- **Integers:** Compact hashes **native-typed heterogeneous tuples** (`persistentHash<[Bytes<32>, …, Uint<16>]>`
  via a compiler-generated tuple `CompactType` using `CompactTypeUnsignedInteger(max, byteLen)`), NOT hand-rolled
  big-endian `Bytes<32>`. ⇒ TS mirrors the same tuple types (or calls the compiled `pureCircuits.*`, which are
  callable from TS and become the single source of truth for the golden vectors).
- **Impact:** `hash.ts`/`credential.ts` tag + field encoding and `test/vectors/credential.json` get regenerated.
  `account-id.ts` (D2), `merkle.ts` structure (D4), and `bundle.ts` are unaffected in shape (merkle node hashing
  re-derives once tags change). No architectural change — just aligning to Compact's real encoding.

## D3 (original guesses — SUPERSEDED by the correction above)
Implemented in `packages/private-credential-core`; golden vectors in
`test/vectors/credential.json`. The Compact circuit must reproduce every `expected` hex.

- **Runtime pin:** `@midnight-ntwrk/compact-runtime@0.16.0` provides `persistentHash`/`persistentCommit`
  (matches the `midnight-nft` foundation). **Phase 2 `compactc`/language/runtime must be the matching pair** so
  the circuit's hashes equal these — the cross-language vector test is the gate.
- **Hash domain:** every value is a Compact `Vector<n, Bytes<32>>`. Each element is exactly 32 bytes.
  - `H(...)` → `persistentHash(Vector<n,Bytes<32>>, elements)`.
  - credential leaf → `persistentCommit(Vector<7,Bytes<32>>, elements, opening)` with `opening` = 32-byte
    `issuer_randomness` (ruling D1).
- **Domain/policy tags → Bytes<32>:** `tag32 = SHA-256(utf8(string))`, **precomputed and embedded as literals**
  (our separators exceed 32 bytes, so truncation-padding would drop the version). Hex literals in
  `src/constants.ts`; the Phase 2 contract embeds the identical 32-byte constants.
- **Integers → Bytes<32>:** unsigned, **big-endian**, fixed 32-byte width (`schema_version`, `birth_year`,
  `valid_until_policy_epoch`, `policy_epoch`, and `jurisdiction_code` encoded as a uint16 of its 2 ASCII bytes
  big-endian, e.g. "CA" → 0x4341).
- **Preimage orders (exact):**
  - holder_key: `[HOLDER, holder_secret]`
  - leaf: `[CREDENTIAL_LEAF, u(schema), credential_id, holder_key, u(birth_year), u(jurisdiction), u(valid_until)]` ⊕ opening=`issuer_randomness`
  - request_commitment: `[REQUEST, account_id_32, request_nonce, policy_id_32, u(policy_epoch)]`
  - nullifier: `[NULLIFIER, holder_secret, policy_id_32, credential_id]`

## D4 — Merkle layer (ACCEPTED by Codex 2026-06-25 — proceed as implemented)
**Ruling:** proceed with the custom fixed-depth persistentHash Merkle tree; do not hold Phase 2. Rationale: the
published root is an upgrade-stable `Bytes<32>` (persistentHash is upgrade-stable; transient/field Merkle hashing
is **not** — per the Midnight stdlib docs); the custom impl + vectors already match the off-chain issuer model;
16 hashes are bounded. **Phase 2 MUST record circuit constraint count + proving time; revisit D4 only if those
measurements are unacceptable** (optimize on measurement, not speculation).

(original proposal:)
Implemented in `src/merkle.ts`; the circuit must fold paths identically.

- **Custom fixed-depth binary Merkle tree, NOT the stdlib `MerkleTree` ADT.** Depth `MERKLE_DEPTH = 16`
  (capacity 65 536). Node hash `H_node(l,r) = persistentHash([MERKLE_NODE_tag, l, r])`; empty leaf = 32 zero
  bytes; empty subtree roots precomputed per level. Path entry `goesLeft=true` ⇒ current node is the left child
  ⇒ parent `H_node(cur, sibling)`, else `H_node(sibling, cur)`.
- **Why custom:** our design builds the tree **off-chain** at the issuer and publishes only the root (Mission
  §9.3); the circuit verifies membership against that published root. A custom persistentHash fold keeps TS and
  Compact identical **by construction** and avoids the runtime `StateBoundedMerkleTree` ↔ `AlignedValue` plumbing
  (which no example project exercises off-chain and which can't be cross-validated until the contract exists).
- **Tradeoff / open question for Codex:** `persistentHash` is explicitly *not* circuit-cost-optimised, so a
  depth-16 proof costs ~16 persistentHash gadgets. The stdlib `MerkleTree`/`merkleTreePathRoot` uses
  field/transient hashing (cheaper) but requires the AlignedValue path-extraction. **If Codex prefers the stdlib
  ADT for cost, that is a contained Phase 2 swap** (the off-chain tree + bundle interface stay the same).
- Leaves are the §8.4 credential leaves (already `persistentCommit` outputs); the tree does not re-hash leaves.

## Audit status
Codex has **not** yet audited commits `ad12259..8d0910e` (its environment had no WSL / no mounted copy). The repo
is now pushed to a private remote for that audit — see `HANDOFF_PHASE0_CODEX.md`.
