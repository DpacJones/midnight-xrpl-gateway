# HANDOFF — current Codex review prompt

The single, always-current prompt to hand Codex (the Auditor) for review. Codex reviews the **HEAD of the
refreshed bundle**; doc-only commits (like edits to this file) don't change the review surface. Update the
**detail-doc link** + the scope below as work lands; per-phase detail lives in `docs/HANDOFF_*_CODEX.md`.
Audit drop (for Codex): `_codex-audit/midnight-xrpl-gateway.bundle` + the `mxg-audit/` checkout +
`origin/master` (private remote `github.com/DpacJones/midnight-xrpl-gateway`).

---

**Codex — debugging help (NOT an audit): the dApp prove step drops `Vector<16,Bytes<32>>` witness elements in the browser.** Full writeup in **`docs/HANDOFF_PROVE_BLOCKER_CODEX.md`**.

Context: contract is deployed live on Preprod (`3d44f5ec…`), gateway-service is wired + validated, browser
connect + deploy work. The prove step is the last keystone and it fails.

**Symptom:** `proveEligibility` errors in *local* circuit execution — *"merkleSiblings … expected Vector<16,
Bytes<32>> but received [11 elements]"* (original indices 8–12 dropped).

**Isolated (please sanity-check):** the data is 16 correct `Uint8Array(32)` in Node
(`apps/dapp/scripts/repro-credential.ts`); two different private-state providers give the same 11 (not the
provider); the error is pre-prover (not 1AM's hosted prover); the Node E2E proves this exact contract+witness
fine. ⇒ working theory = the **browser-bundled `onchain-runtime-v3` WASM mis-marshals the Vector array** under
Vite.

**Prime suspect:** `apps/dapp/vite.config.ts` `onchain-runtime-v3` handling (manualChunks `wasm` + the custom
`wasm-module-resolver` plugin + `optimizeDeps.exclude`) — copied from bboard, which only ever used a single
`Bytes<32>` private-state field. Also check for duplicate/mismatched `compact-runtime`/`onchain-runtime-v3`
copies in the bundle, and how example-kitties handles a Vector witness in-browser (if it does).

**Engage with:** `npm ci`, then `npx tsx scripts/repro-credential.ts` (in `apps/dapp`) + read
`vite.config.ts` / `gateway-api.ts` / `lib/credential.ts` / `witnesses.ts:51`. Earlier productization review
(gateway-service + dApp) is in `docs/HANDOFF_PRODUCTIZATION_CODEX.md` if needed.

---

### History (detail docs)
- `docs/HANDOFF_PHASE{0,2,3,4,5,6}_CODEX.md` — per-phase handoffs (all green).
- `docs/HANDOFF_PRODUCTIZATION_CODEX.md` — gateway service + dApp foundation (green).
- `docs/HANDOFF_PROVE_BLOCKER_CODEX.md` — the browser Vector-witness drop (CURRENT ask).
