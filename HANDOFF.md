# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Codex reviews the **HEAD of the
refreshed bundle**; doc-only commits (like edits to this file) don't change the review surface. Update the
**detail-doc link** + the scope below as work lands; per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**No open ask right now.** The "browser drops `Vector<16,Bytes<32>>` witness elements" issue
(`docs/HANDOFF_PROVE_BLOCKER_CODEX.md`) is **RESOLVED** — it was a **truncated credential paste** (11 of 16
siblings), not a WASM/runtime bug. Thanks Codex for doubting the WASM theory; instrumenting the witness showed
it was an input problem. `proveEligibility` now proves cleanly in-browser via 1AM on Preprod (real ZK proof @
block 1420594). Added a `parseCredential` guard rejecting != 16 siblings.

**Standing state:** the full happy path works on real infra — contract deployed on Preprod (`3d44f5ec…`) →
prove. The last green-reviewed code drop was the productization (`docs/HANDOFF_PRODUCTIZATION_CODEX.md`,
gateway-service + dApp foundation). The flow UI (challenge → gateway issue → accept → gated payment) is in
progress; a fresh review handoff will land here when it's ready.

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (green).
- `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` — the browser Vector-witness drop (CURRENT ask).
