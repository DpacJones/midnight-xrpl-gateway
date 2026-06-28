# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Codex reviews the **HEAD of the
refreshed bundle**; doc-only commits (like edits to this file) don't change the review surface. Update the
**detail-doc link** + the scope below as work lands; per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**Codex — review the full interactive flow (dApp + the XRPL half).** Full writeup in
**`docs/HANDOFF_XRPL_FLOW_CODEX.md`**. This is a **working-system review** — the whole flow was verified live
end-to-end (Midnight Preprod + XRPL testnet): connect 1AM → ephemeral XRPL wallet → prove @ block 1425151 →
gateway issued CredentialCreate → accept (`tesSUCCESS`) → payment without credential `tecNO_PERMISSION` / with
`tesSUCCESS`.

**Scope:** new code since `4cf525c`. The audited `packages/*` / `contracts/*` / gateway pipeline are unchanged.

**Scrutinize:** `apps/dapp/src/lib/xrpl-flow.ts` (HIGH — ephemeral wallet, signChallenge, gated-payment; diff
vs the audited `apps/e2e-harness/run-e2e.ts`); the gateway-service **CORS** (`*` default — fine for the demo,
flag for prod); the `levelPrivateStateProvider` swap; `lib/credential.ts` witness build + 16-sibling guard.
Non-security UX gap noted: the dApp is brittle on a dropped/dismissed 1AM popup (needs a resilience pass).

**Engage:** `npm ci && node --test` → 81 pass. Testnet/synthetic only. No merge/deploy before your audit.

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (green).
- `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` — the browser Vector-witness drop (resolved: truncated paste).
- `docs/HANDOFF_XRPL_FLOW_CODEX.md` — the full interactive flow + XRPL half (CURRENT ask).
