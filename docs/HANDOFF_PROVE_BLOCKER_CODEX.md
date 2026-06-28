# Diagnostic Handoff → Codex: browser drops Vector<16,Bytes<32>> witness elements

**For:** Codex · **From:** Claude (Builder) · **Date:** 2026-06-28 · **Type:** debugging help (not an audit)

This is **not** a green/merge review — it's a request for a second opinion on a browser-bundling/runtime bug
that's blocking the dApp's prove step. Everything else is live: contract deployed on Preprod (`3d44f5ec…`),
gateway-service wired + validated, browser connect + deploy working. The prove is the last keystone.

## Symptom
In the browser dApp, `proveEligibility` fails during **local circuit execution** with:
```
Unexpected error executing scoped transaction '<unnamed>':
type error: merkleSiblings return value at PrivateCredentialGateway.compact line 56 char 1;
expected value of type Vector<16, Bytes<32>> but received [ <11 Uint8Arrays> ]
```
The received array has **11 elements, not 16** — it contains original indices **0–7 and 13–15**; indices
**8–12 are dropped**. (Confirmed by first-byte values in the error vs the credential.)

## Tight isolation (please sanity-check this reasoning)
1. **The data is correct in Node.** `apps/dapp/scripts/repro-credential.ts` runs the dApp's *exact*
   `parseCredential → buildProveRequest` on the real credential → **16 elements, all `Uint8Array(32)`**,
   first bytes `0,118,110,70,77,168,174,221,20,33,20,82,159,65,26,142` (the 8–12 values `20,33,20,82,159`
   are present). Run: `npx tsx scripts/repro-credential.ts` in `apps/dapp` (needs `.demo-deploy.json`).
2. **Not the private-state provider.** Tried the bboard **in-memory** provider (stores raw, no codec) AND
   `levelPrivateStateProvider` (codec, IndexedDB) — **both** yield the identical 11. Different providers,
   same drop ⇒ provider is not the cause.
3. **Not the prover.** The error is *local* circuit execution ("executing scoped transaction"), before any
   proof is generated. (1AM uses a hosted prover, but this fails earlier.)
4. **The Node E2E proves this exact contract + witness fine** (`apps/e2e-harness/run-e2e.ts`, 16 siblings,
   local proof server) — so the contract/witness/data are all correct.
5. Only the **Vector** witness drops elements; the single `Bytes<32>` witnesses (holderSecret, etc.) survive.

⇒ Working hypothesis: the **browser-bundled `@midnight-ntwrk/onchain-runtime-v3` WASM runtime mis-marshals
the `Vector<16, Bytes<32>>`** during local circuit execution under Vite.

## Where to look
- **`apps/dapp/vite.config.ts`** — PRIME SUSPECT. It has special handling for `onchain-runtime-v3`:
  `manualChunks` forcing a separate `wasm` chunk, a custom `wasm-module-resolver` plugin that forces the
  `onchain-runtime-v3` import (from `compact-runtime`) to `external:false, moduleSideEffects:true`, and
  `optimizeDeps.exclude` of the wasm. Could this chunking/duplication corrupt the array marshalling or
  create two runtime copies (realm mismatch)? It's copied from bboard-ui — but bboard's private state is a
  single `Bytes<32>`, so it may never have exercised a Vector witness.
- `apps/dapp/src/midnight/gateway-api.ts` — `proveEligibility` (sets private state, calls `callTx`).
- `apps/dapp/src/lib/credential.ts` — `buildProveRequest` (builds the 16-element witness; verified correct).
- `contracts/private-credential-gateway/src/witnesses.ts:51` — the `merkleSiblings` witness (returns the array).
- `apps/e2e-harness/src/run-e2e.ts` / `providers.ts` — the WORKING Node path for comparison.

## Questions for you
1. Is the `vite.config.ts` `onchain-runtime-v3` handling corrupting WASM array marshalling? Better config?
2. Are there **duplicate copies / version mismatches** of `onchain-runtime-v3` or `compact-runtime` in the
   bundle (realm/instanceof issue that hits arrays but not scalars)? `npm ls @midnight-ntwrk/compact-runtime
   @midnight-ntwrk/onchain-runtime-v3` in the dApp.
3. Does a known-working browser Midnight dApp (example-kitties at `~/projects/example-kitties`, or bboard)
   exercise a `Vector<N, Bytes<32>>` witness in-browser — and if so, what does its bundling/runtime wiring
   do differently?
4. Any known `onchain-runtime-v3`/`compact-runtime` (runtime 0.16.0) browser bug with Vector marshalling?

## Run
`npm ci` (Linux/WSL — native addons). The Node repro (`scripts/repro-credential.ts`) + reading the configs
is enough to engage; the live browser prove needs the dApp built (`npm run build -w @mxrpl/dapp` after
`npm run compile -w …gateway-contract`) + served + 1AM on Preprod. Full context: memory "PROVE BLOCKER".
