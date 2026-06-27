# Spike: browser-side proving for the interactive dApp

**Question:** can a *user* generate our `proveEligibility` ZK proof in a browser (via 1AM/Lace), or do
we need a hosted prover? This gates every interactive version of the dApp (Aliit demo *and* product).

**Verdict: GREEN — feasible, documented, and 1AM is the best-fit wallet.** No new protocol work; the
browser-proving pattern is canonical, and the witness inputs stay on the user's machine (privacy holds).

## How browser proving actually works (from the canonical tutorial)
The official pattern (`midnight-hackathon/bboard-ui` → `BrowserDeployedBoardManager.ts`) wires four
browser providers. Adapted to our contract, the dApp needs:

| Provider | Browser implementation | Note |
|---|---|---|
| `zkConfigProvider` | `FetchZkConfigProvider(origin, fetch)` — **fetches the circuit's proving keys as static assets** from the dApp origin | replaces our Node `NodeZkConfigProvider`; serve `managed/` under the web app |
| `proofProvider` | `httpClientProofProvider(config.proverServerUri, zkConfigProvider)` | the prover URI comes **from the wallet** |
| `publicDataProvider` | `indexerPublicDataProvider(config.indexerUri, config.indexerWsUri)` | from the wallet config |
| `privateStateProvider` | `inMemoryPrivateStateProvider()` | browser; not the Node LevelDB one |
| `walletProvider` / `midnightProvider` | the injected connector balances + submits the proven tx | the wallet signs/submits |

The wallet is found wallet-agnostically: scan `window.midnight.*` for a connector at `apiVersion 4.x`
(`@midnight-ntwrk/dapp-connector-api`), `connect(networkId)`, then read `getConfiguration()` for the
prover/indexer URIs. The witnesses go to the **prover** (hosted, with 1AM — see below); only the proof +
public state go on chain. See [`PRIVACY_BOUNDARY.md`](PRIVACY_BOUNDARY.md) for who sees the witnesses.

## 1AM specifically (Dennis's wallet)
- **DApp Connector v4** day-one — satisfies the `apiVersion 4.x` requirement; the provider wiring above
  works unchanged.
- **Proving is HOSTED, not local (confirmed live 2026-06-27).** `getConfiguration()` returns
  `proverServerUri: https://api-preview.1am.xyz` — 1AM's hosted prover. Convenient (*no proof server for
  you to run*), but the dApp sends the unproven tx (incl. the private witnesses) there, so **1AM's prover
  sees the witnesses** (they never go on-chain). 1AM's "in-browser proving" marketing oversells this. For
  **fully-local** proving (witnesses stay on the user's machine), use **Lace + a local proof server**
  (Settings » Midnight » Local `http://localhost:6300`) or run your own.
- Available on Chrome, Firefox, iOS, Android.

> Minor build-time detail to confirm against the installed connector version: the proving handoff may
> be `config.proverServerUri` + `httpClientProofProvider` (bboard pattern) **or** a newer
> `getProvingProvider()` wallet method. Same capability; just pin the connector version and follow its
> SPECIFICATION. Verify by connecting 1AM and inspecting `getConfiguration()`.

## The one real cost: proving-key asset weight
Our `managed/keys/` (depth-16 Merkle circuit):

| Key | Size | In the user dApp? |
|---|---|---|
| `proveEligibility.prover` | **37 MB** | **yes** — the user proves this |
| `proveEligibility.verifier` | 2.1 KB | on-chain |
| `setPolicyRoot.prover` | 2.7 MB | no — admin-only, not shipped to users |

So the user dApp serves a **~37 MB one-time, cacheable** prover key. Heavy but workable (comparable to a
large WASM bundle; cache + a "preparing prover" first-load state). **This is the strongest argument to
revisit D4** — a shallower Merkle tree or the stdlib field-Merkle ADT would shrink this materially. Track
it as a measurement-driven optimization, not a blocker.

## What this means for the dApp architecture
Browser proving removes the *user-side* infra worry, but **the gateway still must be a backend service**
(it holds the XRPL issuer seed — never in the browser). Division of labor:

- **Browser (1AM):** hold the credential, prove `proveEligibility` in-wallet, submit to Midnight.
- **Gateway backend:** read `approvedRequests`, verify the signed challenge, issue the one `CredentialCreate`.
- **XRPL wallet:** the user's `CredentialAccept` + gated payment — in x-multi this stays on the local
  vault (Non-Custodial Mandate); 1AM signs only the Midnight side. Keep the two signing domains separate.

## Recommended next steps
1. **Stand up the gateway HTTP service** (the safe brick both phases need — wrap `createGateway`).
2. **Hands-on 1AM check:** install the extension, connect, confirm `getConfiguration()` exposes the
   prover + indexer URIs (or `getProvingProvider()`), and prove a trivial circuit end-to-end.
3. **Persistent Midnight deployment** for the contract (testnet/preprod + a synced gateway wallet) so the
   browser indexer reads resolve — note the preprod cold-sync ceiling (use sync-and-restore).
4. Then build the interactive UI (the live version of `/midnight-demo`).

## Sources
- bboard tutorial wiring: `~/projects/midnight-hackathon/bboard-ui/src/contexts/BrowserDeployedBoardManager.ts`
- packages (confirmed on npm): `@midnight-ntwrk/midnight-js-fetch-zk-config-provider@4.1.1`,
  `@midnight-ntwrk/dapp-connector-api@4.0.1`, `@midnight-ntwrk/midnight-js-http-client-proof-provider`
- 1AM: https://1am.xyz/ · DApp Connector API: https://docs.midnight.network/api-reference/dapp-connector
- Lace proving-provider gap: https://forum.midnight.network/t/lace-wallet-doesnt-implement-getprovingprovider-expected-behavior-or-version-gap/1213
