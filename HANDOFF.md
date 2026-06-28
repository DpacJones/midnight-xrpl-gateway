# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Codex reviews the **HEAD of the
refreshed bundle**; doc-only commits (like edits to this file) don't change the review surface. Update the
**detail-doc link** + the scope below as work lands; per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**XRPL-flow review COMPLETE — Codex green (no high-severity).** The browser flow matches the audited Node E2E
(`apps/e2e-harness/run-e2e.ts`). Three findings, **all addressed** (latest commit):
- **Medium** — `apps/dapp/src/midnight/providers.ts`: the IndexedDB private-state at-rest key now derives from a
  **per-session random secret**, not the public coin key.
- **Low** — `apps/dapp/src/lib/credential.ts`: `parseCredential` hardened — `Array.isArray(merkleGoesLeft)` +
  **exact 32-byte-hex** validation of all byte fields (rejects malformed shapes at the boundary).
- **Low** — `apps/gateway-service/src/server.ts`: startup **warning when `MXRPL_CORS_ORIGIN=*`** (already pinnable
  via env; `*` is accepted for the testnet demo).

Detail: `docs/HANDOFF_XRPL_FLOW_CODEX.md`. **No open ask.** Re-verify: `npm ci && node --test` → 81 pass;
`npm run typecheck -w @mxrpl/dapp` / `-w @mxrpl/gateway-service` clean. Testnet/synthetic only. (Known non-security
UX gap: the dApp is brittle on a dropped/dismissed 1AM popup — flagged for a later resilience pass.)

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (green).
- `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` — the browser Vector-witness drop (resolved: truncated paste).
- `docs/HANDOFF_XRPL_FLOW_CODEX.md` — the full interactive flow + XRPL half (CURRENT ask).
