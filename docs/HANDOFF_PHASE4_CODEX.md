# Phase 4 Audit Handoff → Codex

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-26
**Scope:** Phase 4 (the scoped credential gateway) **core**. Phases 0–3 already audited + green-lit. The real
indexer-backed `MidnightReceiptProvider` and a live on-testnet issue land in Phase 5 (need the deployed contract +
indexer) — flagged below, not in scope here.

## What's new since the Phase 3 audit
- **Commit `867e574`** — `packages/gateway` (the only new code; nothing in Phases 0–3 changed since `756bf6d` +
  the `9ac7ddf` JSDoc cleanup you noted).
- Branch `master`; audit-copy tip is this handoff commit. Worktree clean.

## Files (security-critical)
| File | Role |
|---|---|
| `packages/gateway/src/gateway.ts` | the fail-closed §11.2 pipeline |
| `packages/gateway/src/config.ts` | allowlist + **hard mainnet guard** (`assertSafeConfig`) |
| `packages/gateway/src/credential-create.ts` | the ONE fixed `CredentialCreate` (no arbitrary fields) |
| `packages/gateway/src/idempotency.ts` | durable store (atomic file write+rename); key `(network, policy, commitment)` |
| `packages/gateway/src/xrpl-issuer.ts` | real issuer (build/sign/submit; issuer-seed binding) |
| `packages/gateway/test/gateway.test.ts` | §17.4 adversarial suite (11) |

## Fail-closed pipeline (please scrutinize the ordering + that nothing persists before success)
1. strict format/length validation (32-byte hex, valid r-address, `Uint<16>` epoch, non-empty blob)
2. allowlist: `request.midnightContractAddress`/`policyId` must equal the configured ones
3. **real** XRPL challenge verification (`@mxrpl/xrpl-client.verifyChallenge`)
4–6. derive AccountID → recompute request commitment → require exact equality
7–9. confirmed Midnight receipt: `approvedRequests` membership in the configured contract (validated state)
10. durable idempotency — repeated valid request returns the existing record, never re-issues
11. existing XRPL credential → return deterministically (no second issue)
12–16. build fixed `CredentialCreate` → sign only with the configured issuer → submit → wait → **then** persist

Any failed step throws `GatewayError` **before** any `store.put`, so a failed XRPL submit does not mark the
request complete (tested).

## Key safety properties (and where enforced)
- **No arbitrary signing / tx-type injection:** the request schema has no tx-type/issuer/field inputs;
  `buildCredentialCreate` emits exactly `{TransactionType:"CredentialCreate", Account, Subject, CredentialType,
  Memos[, Expiration, URI]}` from config + verified subject + commitment. Test asserts the exact key set.
- **Hard mainnet guard:** `assertSafeConfig` (run in `createGateway`) throws on `xrpl.network !== "testnet"` or a
  mainnet-looking endpoint.
- **Issuer seed** is constructor-supplied (local `.env` in the gateway process), never part of a request, and must
  match `config.xrpl.credentialIssuer` (`xrpl-issuer.ts` asserts this).
- **Idempotency key** = `(network, policy_id, request_commitment)`; atomic file store (`write tmp` + `rename`).

## §17.4 test coverage (all pass, mocked boundaries)
happy path (issues once, persists) · missing receipt · wrong contract · wrong policy · wrong epoch · commitment
mismatch · duplicate→idempotent (issues once) · existing credential→deterministic (no issue) · submit failure→not
persisted, retry proceeds · cannot sign another tx type (fixed builder key-set) · mainnet guard.

## Verification
`node --test` (repo root): **76 tests pass, 0 fail** (65 Phases 0–3 + 11 Phase 4). The gateway tests use mocked
boundaries and need only `npm ci` (no `managed/` bindings, no proof server). Run in WSL (Node v24.11.1).

## Deferred to Phase 5 (NOT in this scope — flagged for transparency)
- **Real `MidnightReceiptProvider`** (indexer query of `approvedRequests`) — needs the deployed contract + indexer.
- **Live end-to-end issue** on testnet from a real receipt.
- Structured redacted logs + rate limiting (§18 hardening) — the pipeline is structured for it but not yet added.

No merge/deploy before your audit. Decisions index: `docs/PROTOCOL_DECISIONS.md`.
