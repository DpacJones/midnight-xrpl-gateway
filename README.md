# Midnight × XRPL — Private Credential Gateway

[![CI](https://github.com/DpacJones/midnight-xrpl-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/DpacJones/midnight-xrpl-gateway/actions/workflows/ci.yml)

**Prove a private eligibility policy on Midnight; let XRPL natively enforce the resulting credential.**

A user proves — in zero knowledge, on [Midnight](https://midnight.network) — that they satisfy a
policy (*adult, resident in an allowed jurisdiction*) **without revealing their date of birth or
jurisdiction**. A narrowly-scoped, explicitly-trusted gateway sees the confirmed on-chain receipt
and proof of XRPL account control, then issues **one** XRPL credential. From there **XRPL itself**
enforces it: a credential-gated payment fails without the credential, succeeds with it, and fails
again after the issuer revokes it.

> This is **not** a trustless bridge and **not** anonymous KYC. Midnight verifies the private
> policy; the gateway is a *trusted* XRPL credential issuer; **XRPL does not verify the Midnight
> proof** — it enforces the credential the gateway issued. Your private attributes never go on-chain
> and the gateway never sees them (though a *hosted* prover does — see below); your XRPL account and
> credential are public. See [`docs/PRIVACY_BOUNDARY.md`](docs/PRIVACY_BOUNDARY.md).

## ▶ See it first

- **Walkthrough deck** — the whole idea in ~2 minutes: **[www.xmulti.app/gateway.html](https://www.xmulti.app/gateway.html)** (source: [`docs/deck.html`](docs/deck.html))
- **Verified live in-browser** on Midnight **Preprod** + XRPL testnet via the [1AM wallet](https://1am.xyz): connect → real ZK `proveEligibility` → gateway issues the credential → accept → credential-gated payment (`tecNO_PERMISSION` → `tesSUCCESS`). The interactive dApp is in [`apps/dapp`](apps/dapp).

## ✅ Working result (verified end-to-end on live infrastructure)

Run against a live local Midnight devnet + live XRPL testnet ([`docs/DEMO.md`](docs/DEMO.md)):

| Step | Result |
|---|---|
| Deploy `PrivateCredentialGateway`, **real on-chain `proveEligibility`** | proof verified by the Midnight ledger |
| Gateway verifies receipt + signed challenge → **issues `CredentialCreate`** | one credential, on XRPL testnet |
| User accepts → payment **without** credential | `tecNO_PERMISSION` — blocked |
| Payment **with** credential | `tesSUCCESS` — allowed |
| `CredentialDelete` → payment **after revocation** | `tecBAD_CREDENTIALS` — re-blocked |

**81 unit/conformance tests** + the live end-to-end lifecycle, all green.

```mermaid
sequenceDiagram
    participant U as User (browser/CLI)
    participant I as Mock Issuer
    participant M as Midnight (PrivateCredentialGateway)
    participant G as Scoped Gateway
    participant X as XRPL

    I->>I: build credential leaf, insert into tree
    I->>M: setPolicyRoot(root, epoch)  (admin)
    U->>M: proveEligibility()  — REAL ZK proof (DOB/jurisdiction stay private)
    M-->>M: assert policy + Merkle membership + nullifier; record requestCommitment
    U->>U: sign non-submittable XRPL challenge (binds account↔request)
    U->>G: CredentialIssueRequest + signedChallengeBlob
    G->>M: read approvedRequests via indexer (confirmed receipt?)
    G->>G: verify challenge signature + recompute commitment (fail-closed)
    G->>X: CredentialCreate (issuer → user)  — the ONLY tx the gateway signs
    U->>X: CredentialAccept
    U->>X: Payment to deposit-auth account WITH CredentialIDs → tesSUCCESS
    I->>X: CredentialDelete → gated payment now fails (tecBAD_CREDENTIALS)
```

## Repository map

| Path | What |
|---|---|
| `packages/private-credential-core` | encoders + hashing + Merkle + credential bundle (the future ProofPass core) |
| `packages/xrpl-client` | the XRPL account-binding challenge (build + **real signature** verify) |
| `packages/gateway` | the scoped, fail-closed credential gateway (issues one fixed `CredentialCreate`) |
| `contracts/private-credential-gateway` | the **normative** Compact contract `PrivateCredentialGateway.compact` |
| `apps/e2e-harness` | deploys to a local Midnight devnet + runs the full lifecycle on XRPL testnet |
| `apps/dapp` | the interactive browser dApp (Vite + React) — connect a Midnight wallet, prove, run the full XRPL flow |
| `apps/gateway-service` | the gateway as an HTTP service (`POST /issue-credential`; issuer seed stays backend-only) |
| `scripts/spike-credentials.mjs` | the Phase 0 XRPL credential-enforcement protocol spike |

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, flow, contract circuits, encoding decisions
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — actors, trust boundaries, defenses, residual risk
- [`docs/PRIVACY_BOUNDARY.md`](docs/PRIVACY_BOUNDARY.md) — what's private / public / visible to the gateway
- [`docs/DEMO.md`](docs/DEMO.md) — run the spike, the unit tests, the real proof, and the full E2E
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) — read this before trusting anything
- [`docs/PROTOCOL_SPIKE.md`](docs/PROTOCOL_SPIKE.md) — the XRPL credential-enforcement evidence
- [`docs/PROTOCOL_DECISIONS.md`](docs/PROTOCOL_DECISIONS.md) — the encoding rulings D1–D4 + measurements

## Quick start

Toolchain (pinned — see `docs/PROTOCOL_DECISIONS.md`): Compact compiler **0.31.1** → language **0.23**
→ runtime **0.16.0**; proof server **8.0.3**; **Node 24.x** (≥22 for native TS + `node:test`; WSL/Linux); `xrpl` **4.6.0**.

```sh
npm ci
node --test                                                   # 81 unit/conformance tests
npm run compile -w @mxrpl/private-credential-gateway-contract  # compile the Compact contract
npm run prove   -w @mxrpl/private-credential-gateway-contract   # one REAL ZK proof (needs proof server :6300)
# Full E2E (needs a local Midnight devnet + XRPL testnet — see docs/DEMO.md):
npm run e2e -w @mxrpl/e2e-harness
```

**Testnet only.** No mainnet deployment; all credential attributes are synthetic demo data, not real KYC.
Part of **Atlantis Engine**.

## License

MIT — see [`LICENSE`](LICENSE) · © 2026 Dpac Jones. Build on it freely.

> The transitive **GPL-3.0** dependencies (`@substrate/connect*`, `@subsquid/*`) come from the Midnight
> SDK's Substrate-based chain tooling — standard for any Midnight dApp. This project vendors **no** GPL
> source; those packages are fetched from npm at install time and are not redistributed in this repo.
