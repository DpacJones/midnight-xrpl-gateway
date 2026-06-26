# §18 Hardening + Docs Audit Handoff → Codex

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-26
**Scope:** the §18 gateway hardening (code) + the Phase 6 doc set. Phases 0–5 already audited green.
Branch `master`, tip **`beedfdc`**, worktree clean, **80 unit tests green**.

## What's new since the Phase 5 audit (`1ae055b`)
| Commit | What |
|---|---|
| `2eb53e8` | **§18 hardening** — structured redacted logs + issuance rate limiting (CODE — please audit) |
| `beedfdc` | Phase 6 docs (README + ARCHITECTURE + THREAT_MODEL + PRIVACY_BOUNDARY + DEMO + KNOWN_LIMITATIONS) |

## A. §18 hardening — the code to scrutinize
New/changed files: `packages/gateway/src/logger.ts`, `rate-limit.ts`, and the pipeline wiring in
`gateway.ts`. The fail-closed logic, the fixed `CredentialCreate` builder, the idempotency critical
section, and the mainnet guard are **unchanged** from your green-lit review.

**Logging (redaction is the security point):**
- Injectable `GatewayLogger` (default `nullLogger`; `consoleLogger` wired in `apps/e2e-harness/run-e2e.ts`).
- `safeRequestFields()` is an explicit **allowlist** — `{contract, requestCommitment, policyEpoch,
  xrplAccount}`. It deliberately **never** logs `signedChallengeBlob` (a signed tx) or `requestNonce`
  (private-until-submission). Result/rejection logs add only `status`/`credentialId`/`createHash`/`code`.
- Please confirm: nothing on the issuance path can leak a secret into a log line. Tests assert the blob
  and nonce never appear in any emitted record (success and rejection paths).

**Rate limiting:**
- Injectable `RateLimiter` + `FixedWindowRateLimiter` (default **20 / 60 s per XRPL subject**).
- Placed **after validation, before** the expensive sig-verify / indexer / XRPL-submit work — sheds load
  early. Confirm the placement (it uses the validated `xrplAccount` as the key; invalid accounts fail
  validation first). ⚠️ in-process — documented as needing a shared limiter for multi-process (same
  caveat as the idempotency store).

**Pipeline wrapper:**
- `issueCredential` is now wrapped in `try { … } catch (e) { log rejected; throw e }` with a
  `request.received` / `issuance.result` / `issuance.rejected` log trio. The wrapper **rethrows** — it
  changes no control flow and adds no new success path. Please confirm it can't swallow a failure.

**Tests:** 3 new (`rate limit sheds…`, `logging…redacts the blob + nonce`, `rejection is logged with its
code, blob still redacted`). 15 gateway tests / 80 repo-wide green.

## B. Phase 6 docs — for an honesty/accuracy read
`README.md` + `docs/{ARCHITECTURE,THREAT_MODEL,PRIVACY_BOUNDARY,DEMO,KNOWN_LIMITATIONS}.md`. They are
grounded in the built system and lead with the honest trust posture: Midnight verifies the private
policy; the gateway is a *trusted* issuer; **XRPL does not verify the Midnight proof**; attributes stay
local, the XRPL account/credential are public; the `CredentialCreate` memo is a deliberate cross-chain
link. `KNOWN_LIMITATIONS.md` states all of it (trusted issuer, issuer-key compromise, single-process
scale-out, ~16–25 s proof, synthetic data, non-goals). **Please flag any claim that overstates what was
built or understates a limitation** — accuracy + honesty are the point of this pass.

## Verification
`npm ci && node --test` → 80 pass, 0 fail (the gateway tests use mocked boundaries; no infra needed).
The hardening is additive and unit-covered; the happy path is unchanged. Live E2E unchanged from Phase 5.

No merge/deploy before your audit. Decisions index: `docs/PROTOCOL_DECISIONS.md`.
