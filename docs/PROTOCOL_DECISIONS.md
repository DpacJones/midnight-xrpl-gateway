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

## Audit status
Codex has **not** yet audited commits `ad12259..8d0910e` (its environment had no WSL / no mounted copy). The repo
is now pushed to a private remote for that audit — see `HANDOFF_PHASE0_CODEX.md`.
