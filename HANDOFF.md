# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Codex reviews the **HEAD of the
refreshed bundle**; doc-only commits (like edits to this file) don't change the review surface. Update the
**detail-doc link** + the scope below as work lands; per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**XRPL-flow review COMPLETE — Codex green (no high-severity).** The browser flow matches the audited Node E2E
(`apps/e2e-harness/run-e2e.ts`). Three findings, **all addressed** (latest commit):
- **Medium** (`apps/dapp/src/midnight/providers.ts`) — **re-evaluated + ACCEPTED, not code-fixed.** A first
  attempt (per-session random at-rest key) **broke the dApp**: the level provider persists + reuses a signing
  key, so a changing password fails to decrypt it (`OperationError` in `setOrGetInitialSigningKey` →
  `findDeployedContract`) — confirmed live. The key **must be stable**, so it stays keyed off the (public) coin
  key. Documented as an accepted **testnet/synthetic-demo** limitation in `docs/KNOWN_LIMITATIONS.md §5b`;
  production needs a real user-secret-derived (or per-session wallet-signature) key.
- **Low** — `apps/dapp/src/lib/credential.ts`: `parseCredential` hardened — `Array.isArray(merkleGoesLeft)` +
  **exact 32-byte-hex** validation of all byte fields (rejects malformed shapes at the boundary). ✅ fixed.
- **Low** — `apps/gateway-service/src/server.ts`: startup **warning when `MXRPL_CORS_ORIGIN=*`**. ✅ fixed.

**Re-verified live after the revert** (Lace + 1AM both work): prove reaches the circuit and executes
`proveEligibility` correctly — no `OperationError`. Detail: `docs/HANDOFF_XRPL_FLOW_CODEX.md`. **No open ask.**
Re-verify: `npm ci && node --test` → 81 pass; typechecks clean. Testnet/synthetic only. (Known non-security UX
gap: the dApp is brittle on a dropped/dismissed wallet popup — flagged for a later resilience pass.)

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (green).
- `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` — the browser Vector-witness drop (resolved: truncated paste).
- `docs/HANDOFF_XRPL_FLOW_CODEX.md` — the full interactive flow + XRPL half (CURRENT ask).
