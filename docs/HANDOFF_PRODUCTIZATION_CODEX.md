# Productization Audit Handoff → Codex (gateway service + dApp foundation)

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-26
**Scope:** the new code since the Phase 6 audit (`62647e6`). Phases 0–6 + §18 already audited green; the
audited `packages/*` + `contracts/*` + the gateway pipeline are **unchanged**. Branch `master` (tip
advances as audit fixes land), worktree clean, **81 unit tests green**; both new apps now have a
`tsconfig.json` + `typecheck` script and pass clean.

## Audit-round-1 fixes applied (your two blockers + cleanups)
- **gateway-service typecheck gap (BLOCKER):** added `apps/gateway-service/tsconfig.json` + a `typecheck`
  script; fixed the `receipt-provider.ts` indexer→`ledgerOf` adapter (cast to `Parameters<typeof ledgerOf>[0]`,
  in one isolated helper line). `npm run typecheck -w @mxrpl/gateway-service` → clean.
- **dApp build not reproducible on Windows (BLOCKER):** replaced the Unix `cp -r` steps with a portable
  `scripts/copy-assets.mjs` (`fs.cpSync`); build is now `tsc --noEmit && vite build && node scripts/copy-assets.mjs`
  (also drops the `tsc -b` tsbuildinfo). Verified the copy on this workspace.
- **cleanups:** `.env.example` is now committed (the `.env.*` ignore rule was swallowing it — added
  `!**/.env.example`); body-cap trip now returns **413 payload-too-large** (not 400); `tsconfig.tsbuildinfo`
  gitignored.

## Audit-round-2 fix (dApp build reproducibility)
Your round-2 blocker: the build copied gitignored ZK assets the documented compile path didn't produce **on
Windows**. Root cause: `npm run compile` is the full `compact compile +0.31.1`, which produces `managed/keys`
+ `managed/zkir` **only where the Compact proving backend exists (WSL/Linux)** — Windows emits only
`managed/contract`. This is the same toolchain constraint as compile/prove/e2e. Resolution (your option 2 —
explicit prerequisite + wired into docs):
- `copy-assets.mjs` now **checks for the assets and exits with actionable guidance** (run compile first) instead
  of ENOENT.
- New **`apps/dapp/README.md`** documents the `compile → build` prerequisite + the WSL/Linux requirement.
- **Verified end-to-end in WSL:** `npm run compile -w …gateway-contract` (→ all 4 keys + zkir) then
  `npm run build -w @mxrpl/dapp` (→ WASM bundle + `dist/{keys,zkir}`). Reproducible in the supported env.
- Not committing the 37 MB prover key (keeps the repo + audit bundle lean); to deploy, build in WSL and publish
  the static `dist/`, or compile in a Linux CI with the toolchain.

## Commits since `62647e6`
| Commit | What | Audit weight |
|---|---|---|
| `a8f1211` | **`apps/gateway-service`** — HTTP backend wrapping the gateway pipeline (220 LoC) | **HIGH — please scrutinize** |
| `a2a9e25` | **`apps/dapp`** — interactive dApp foundation (Vite/React, 292 LoC) | MEDIUM — architecture/soundness read |
| `77188dc` | browser-proving spike doc (research) | FYI |
| `eb720c9` | Phase 6 handoff drift fix (docs) | none |

## A. `apps/gateway-service` — the security-relevant new code
Wraps the audited `createGateway` as an always-on backend (the XRPL **issuer seed** lives here, never in
the browser). The gateway pipeline itself is **unchanged** — this is the HTTP boundary around it.

Files: `src/config.ts` (env loader + `assertSafeConfig` mainnet guard at startup), `src/receipt-provider.ts`
(read-only indexer `approvedRequests` query), `src/server.ts` (`node:http`: `POST /issue-credential`,
`GET /health`).

**Please verify:**
1. **No seed leakage.** `MXRPL_ISSUER_SEED` is env-only, gitignored (`.env` + idempotency file), and never
   logged (the gateway already redacts; the service adds no logging of the request body beyond the gateway's
   own `safeLog`). Confirm nothing in the service prints/returns the seed or the signed blob.
2. **Untrusted body handling.** The POST body is parsed as untrusted and passed straight to
   `gateway.issueCredential` (which re-validates every field). 16 KB body cap (`MAX_BODY`); JSON parse
   failure → 400. Confirm there's no path that trusts the body before the pipeline validates it.
3. **The pre-auth IP limiter + `trustProxy`.** A `FixedWindowRateLimiter` keyed by `clientIp(req)` runs
   before any work (the transport-layer limiter you recommended). `X-Forwarded-For` is honored **only** when
   `MXRPL_TRUST_PROXY=true` — otherwise `req.socket.remoteAddress`. Confirm the spoofing caveat is handled
   correctly (XFF must not be trusted by default) and the README states it.
4. **Error→status mapping.** `GatewayError` → 400 (validation/allowlist/challenge/commitment), 403
   `receipt:missing`, 429 `rate-limited`, 500 `config:*`; non-GatewayError → 500 `internal` (logged server-side
   only, not leaked). Confirm no internal detail leaks to the client.
5. **Mainnet guard** runs at startup (`loadServiceConfig` → `assertSafeConfig`) and again in `createGateway`.

Smoke-verified: boots + `/health` 200; `POST {}` → 400 `validation:bad-hex32` with structured redacted logs;
bad-json 400; 404 routing. (Full live issuance needs a deployed contract + indexer + funded issuer.)

## B. `apps/dapp` — interactive dApp foundation (lower audit weight)
Standalone Vite/React app (Aliit phase). **Client-side only — holds no secrets** (the user proves in 1AM; the
seed-signed CredentialCreate is the service's job). I'd value an **architecture/soundness** read more than a
deep security pass here, since it's not deployed and has no key material.

- `src/midnight/providers.ts` — browser connection layer adapted from the canonical `bboard-ui` (Apache-2.0):
  1AM via `dapp-connector-api` v4, `FetchZkConfigProvider`, `httpClientProofProvider` (wallet-supplied prover
  URI), indexer, in-memory private state. Witnesses never leave the browser/wallet.
- `src/midnight/gateway-api.ts` — `join` + `proveEligibility`, mirroring our proven harness (CompiledContract
  + `findDeployedContract`). **Flagged seam:** in the browser the ZK assets come from `FetchZkConfigProvider`,
  but `findDeployedContract` type-wants `withCompiledFileAssets(origin)` — typechecks, but the runtime
  reconciliation is validated live (needs 1AM + a deployed contract). Sanity-check the approach.
- `src/lib/gateway-client.ts` — typed `POST /issue-credential` client.
- `src/App.tsx` — minimal connect-1AM + health shell.

**Status:** typechecks clean **and vite-builds end-to-end in WSL** — verified `compile → build`: the
Midnight WASM bundle compiles (onchain-runtime + ledger + app) and the portable copy lands keys+zkir in
`dist/`. **Build prerequisite:** the contract must be compiled first (`npm run compile -w …gateway-contract`),
which needs the Compact toolchain — **WSL/Linux only**, same as compile/prove/e2e across the repo; the keys
(~37 MB prover) are gitignored, not committed. On bare Windows the build can't generate the keys (no proving
backend) — `copy-assets.mjs` now fails with clear guidance instead of a raw ENOENT. **Not** yet runtime-validated
(needs 1AM + a deployed contract). Not security-sensitive; flag any unsound assumption in the connection layer.

## Verification
`npm ci && node --test` → 81 pass. `npm run typecheck -w @mxrpl/gateway-service` and `-w @mxrpl/dapp` →
clean (both apps now have their own `tsconfig.json` + `typecheck` script). `npm run build -w @mxrpl/dapp`
uses a portable Node copy (no Unix `cp`). The `node_modules` carries Linux-native addons — `npm ci` on
your platform; don't copy the WSL tree.

No merge/deploy before your audit. Decisions index: `docs/PROTOCOL_DECISIONS.md`; build gotchas in the vault.
