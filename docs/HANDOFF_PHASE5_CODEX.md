# Phase 5 Audit Handoff → Codex

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-26
**Scope:** Phase 5 (end-to-end CLI / integration). Phases 0–4 already audited + green-lit. The §18
hardening (structured redacted logs, rate limiting) is still deferred — flagged below.

## What's new since the Phase 4 audit
- **`apps/e2e-harness/`** (commits `7f06e80` deploy milestone, `e305a8c` full E2E). The audited Phases
  0–4 code (`packages/*`, `contracts/*`) is **unchanged**.
- Branch `master`, tip **`e305a8c`**, worktree clean. Root workspaces += `apps/*`; `smoldot` override.

## Provenance (important for review effort)
`apps/e2e-harness/src/wallet.ts` and `providers.ts` are **near-verbatim ports** of
`midnight-nft/harness/midnight/src/*` (Apache-2.0, itself ported from `example-counter`) — the
intricate, version-sensitive wallet-SDK glue. Only the renames (`NftZk*`→`Gateway*`) differ. **The
genuinely NEW logic to scrutinize:**
| File | Role |
|---|---|
| `src/midnight-receipt-provider.ts` | **real** `MidnightReceiptProvider` — the production wiring of the boundary the §17.4 tests mock (indexer `queryContractState` → `ledger.approvedRequests.member`) |
| `src/run-e2e.ts` | orchestration of the full lifecycle (no new trust logic — it composes audited pieces) |
| `src/app.ts` / `src/contract.ts` | deploy/join + contract wiring; `deployContract({…, args})` passes the constructor params |

The gateway pipeline (`packages/gateway`), the contract, the core encoders, and the challenge verifier
are all the already-audited code — Phase 5 wires them to live infrastructure, it does not change them.

## Live verification (this can only be re-run with the devnet + XRPL testnet up)
Ran `npm run e2e` against a **live local Midnight devnet** (node 0.22.3 / indexer 4.0.0 / proof 8.0.3)
+ **live XRPL testnet**. First run, green. Artifact (`apps/e2e-harness/e2e-artifact.json`, gitignored):
- Midnight contract `2d97135e…`, **real on-chain `proveEligibility` @ block 270**, request commitment
  `600cbfa2…` recorded in `approvedRequests` (read back via the indexer by the receipt provider).
- Gateway issued credential `55E4939D…` (CredentialCreate `2D23D742…`).
- XRPL lifecycle: payment **without** credential `tecNO_PERMISSION` (`48C3BDEF…`); **with** credential
  `tesSUCCESS` (`BC997F02…`); `CredentialDelete` (`A6894D1B…`); payment **after revocation**
  `tecBAD_CREDENTIALS` (`FD2613A8…`). `E2E_LIFECYCLE_PROVEN: true`.

## How to run (if Codex's env can reach the infra)
`/midnight-tooling:devnet start` (node/indexer/proof on 9944/8088/6300), then in WSL:
`npm ci`, compile the contract (`npm run compile -w …gateway-contract`), then
`npm run e2e -w @mxrpl/e2e-harness` (needs internet for the XRPL testnet faucet). The `node_modules`
has Linux-native addons — install on the running platform; don't copy the WSL tree.

## Points I'd flag for the audit
- `midnight-receipt-provider.ts` re-checks the contract address (defence in depth) and reads
  **validated** state via the indexer; it returns membership only, the gateway already recomputed +
  bound the commitment. Confirm that's the right trust split.
- `run-e2e.ts` uses ephemeral faucet wallets and writes only public addresses/hashes to the artifact
  (no seeds/secrets). The genesis devnet wallet seed (`0x…01`) is standalone-only (no real value).
- **Still deferred (§18):** structured redacted logs + rate limiting on the gateway issuance path, and
  the `FileIdempotencyStore` is single-process (documented). Recommend before any real deployment.

No merge/deploy before your audit. Decisions index: `docs/PROTOCOL_DECISIONS.md`.
