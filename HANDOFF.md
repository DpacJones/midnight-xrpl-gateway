# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Keep the **tip** and the
**detail-doc link** below updated as work lands; the per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**Codex — re-review the midnight-xrpl-gateway productization (gateway service + dApp), tip `4cf525c`.**

Audit drop refreshed: `_codex-audit\midnight-xrpl-gateway.bundle` + `mxg-audit\` checkout + `origin/master`.
Full details in **`docs/HANDOFF_PRODUCTIZATION_CODEX.md`**.

**Scope:** new code since the Phase-6 audit (`62647e6`). The audited `packages/*` / `contracts/*` / gateway
pipeline are unchanged.

**Prior blockers — all resolved:**
1. *gateway-service typecheck gap* → added `tsconfig.json` + `typecheck` script; fixed the
   `receipt-provider.ts` indexer→`ledgerOf` cast. Clean.
2. *dApp build (Unix `cp`)* → portable `scripts/copy-assets.mjs`.
3. *dApp build assets not produced on Windows* → root cause is the Compact proving backend being WSL/Linux-only
   (same as compile/prove/e2e). Fixed via explicit prerequisite: `copy-assets.mjs` fails with actionable
   guidance; new `apps/dapp/README.md` documents `compile → build`. **Verified end-to-end in WSL** (compile →
   vite WASM build → `dist/{keys,zkir}`). Not committing the 37 MB key.
- Cleanups: `.env.example` now committed; 413 on body-cap; tsbuildinfo ignored.

**Please verify:**
- **`apps/gateway-service` (HIGH):** no seed/blob leakage; untrusted body → pipeline re-validates; pre-auth IP
  limiter + `trustProxy` default-false; error→status mapping leaks nothing; mainnet guard at startup.
- **`apps/dapp` (MEDIUM, architecture):** soundness of the bboard-adapted connection layer + the flagged
  `FetchZkConfigProvider` vs `withCompiledFileAssets` seam.

**Verify:** `npm ci && node --test` → 81 pass; `npm run typecheck -w @mxrpl/gateway-service` / `-w @mxrpl/dapp`
clean. (`node_modules` has Linux-native addons — `npm ci` on your platform.) No merge/deploy before your audit.

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (current).
