# Audit Handoff → Codex: the full interactive flow (dApp + XRPL half)

**For:** Codex · **From:** Claude (Builder) · **Date:** 2026-06-28
**Scope:** everything since the last Codex-green productization (`4cf525c`). Branch `master`, tip
**`267e384`**, worktree clean, **81 unit tests green**, dApp typechecks + builds.

## ✅ The whole thing is VERIFIED live (browser, real infra)
The complete flow ran end-to-end on **Midnight Preprod + XRPL testnet**, in a browser via 1AM:
connect → ephemeral XRPL wallet → **prove eligibility @ block 1425151** → gateway-service **issued the
CredentialCreate** → **CredentialAccept = tesSUCCESS** → payment **WITHOUT** credential = `tecNO_PERMISSION`,
**WITH** = `tesSUCCESS`. (Also demonstrated: nullifier replay protection — a spent credential can't re-prove.)

So this is a **working-system review**, not a "does it work" review. The audited `packages/*` +
`contracts/*` + the gateway pipeline are unchanged; this is the dApp + the gateway-service HTTP edge.

## What's new (the code to review)
| File | LoC | What | Weight |
|---|---|---|---|
| `apps/dapp/src/lib/xrpl-flow.ts` | 91 | **the XRPL half** — ephemeral faucet wallet, sign challenge, CredentialAccept, gated-payment demo | **HIGH** |
| `apps/dapp/src/lib/credential.ts` | 69 | parse credential + build proveEligibility witness inputs + **16-sibling guard** | MEDIUM |
| `apps/dapp/src/midnight/providers.ts` | 119 | multi-wallet (1AM/Lace), **levelPrivateStateProvider** (browser), prover override, prover-source badge | MEDIUM |
| `apps/dapp/src/midnight/gateway-api.ts` | 61 | deploy / join / proveEligibility (+ `setContractAddress`) | MEDIUM |
| `apps/dapp/src/lib/gateway-client.ts` | 50 | `requestCredential` + `getGatewayInfo` (issuer from /health) | LOW |
| `apps/dapp/src/App.tsx` | 313 | flow orchestration (3-step UI) | LOW (logic, not security) |
| `apps/gateway-service/src/server.ts` | — | **added CORS** (origin + OPTIONS preflight) | flag below |

Commit chain (since `4cf525c`): multi-wallet picker → privacy-claim correction → browser admin deploy →
setNetworkId fix → Buffer polyfill → full PrivateStateProvider → wire gateway to Preprod → prove flow →
**level provider fix** → prove-blocker (false alarm, see below) → **full XRPL flow** (`267e384`).

## Please scrutinize
1. **`lib/xrpl-flow.ts` (HIGH):** the ephemeral wallet is a throwaway faucet key (never a real one — by
   design; a personal mainnet seed must never enter the dApp). Confirm `signChallenge` builds the *same*
   challenge `verifyChallenge` expects (both use `@mxrpl/xrpl-client buildChallenge`), and that the
   gated-payment sequence (DepositAuth + credential preauth + with/without `CredentialIDs`) is sound. It's a
   faithful port of the audited Node E2E (`apps/e2e-harness/run-e2e.ts`) — diff against it.
2. **Gateway-service CORS:** I added `access-control-allow-origin` (default `*` via `MXRPL_CORS_ORIGIN`) +
   an OPTIONS handler so the browser dApp can call it. **`*` is fine for the testnet demo; flag that a real
   deployment must restrict the origin.** Confirm CORS doesn't weaken anything else (the pipeline still
   re-validates every field; no credentials/cookies are used).
3. **The `levelPrivateStateProvider` swap** (replaced a hand-written in-memory one): the in-memory provider
   broke the `Vector<16,Bytes<32>>` witness; level (IndexedDB) — the same provider the Node E2E uses, and
   what example-kitties uses in-browser — fixed it. `apps/dapp/src/midnight/in-memory-private-state.ts` is
   now **dead code** (safe to delete).
4. **Resolved false alarm (FYI):** the "browser drops Vector witness elements" panic was a **truncated
   credential paste** (11 of 16 siblings), not a runtime bug — you correctly doubted the WASM theory. Now
   guarded in `parseCredential`. `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` has the trail.

## Known non-security gap (UX, not a finding)
The dApp's connection handling is **brittle on disconnect** — a dismissed 1AM popup or dropped connection
forces a restart (no reconnect/retry/step-resume). That's thin-dApp + alpha-wallet, not architecture;
flagged for a resilience pass before any wider demo. Not a security issue.

## Run
`npm ci && node --test` → 81 pass (mocked boundaries; no infra). Full live flow needs the gateway-service
(`apps/gateway-service`, env-configured for Preprod + a funded XRPL testnet issuer) + the dApp built/served +
1AM on Preprod — Codex can review by code + the unit tests + diffing `xrpl-flow.ts` against `run-e2e.ts`.
Testnet + synthetic data only. No merge/deploy before your audit.
