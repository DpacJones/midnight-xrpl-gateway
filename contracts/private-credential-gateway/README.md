# PrivateCredentialGateway.compact

The normative Compact contract for the Midnight XRPL Private Credential Gateway. The TypeScript
`@mxrpl/private-credential-core` is an independent implementation that must conform; the
`pureCircuits.*` exported here are the cross-language oracle (see
`packages/private-credential-core/test/conformance.test.ts`).

## Pinned toolchain (the #1 Midnight footgun — keep these together)

| Component | Version |
|---|---|
| `compact` dev tool | 0.5.1 |
| **compiler** | **0.31.1** (`compact compile +0.31.1`) |
| **language** | **0.23** (pragma `>= 0.16 && <= 0.23`) |
| **runtime ABI** | **0.16.0** (`@midnight-ntwrk/compact-runtime@0.16.0` — matches the TS core and `midnight-nft`) |
| proof server | `midnightntwrk/proof-server:8.0.3` (:6300) |

> Compiler 0.25.0 (the default before pinning) targets runtime ABI 0.8.1 and will NOT load against
> the TS core's runtime 0.16.0. Always compile with `+0.31.1`.

## Build

```sh
# from this directory, in WSL with compact + node on PATH:
npm run compile          # -> managed/ (bindings, ZKIR, prover/verifier keys)
```

`managed/` is gitignored (large keys, regenerable). The conformance test skips if it is absent, so
compile before running `node --test` at the repo root to exercise the oracle.

## Real proving (D4 / exit-gate evidence)

```sh
npm run prove           # proof server must be running on :6300
```

`test/prove-harness.ts` builds an unproven `proveEligibility` call tx from local states
(`createUnprovenCallTxFromInitialStates` — no node/indexer/wallet) and proves it via
`httpClientProofProvider` against the proof server. Measured: **~16.4 s** for a real proof
(single cold run). Constraint proxy (ZKIR ops): `proveEligibility` 418, `setPolicyRoot` 88.

## Surface

- **Ledger:** `admin, policyId, credentialRoot: Bytes<32>`; `policyEpoch, adultCutoffYear,
  allowedJurisdiction: Uint<16>`; `usedNullifiers, approvedRequests: Set<Bytes<32>>`.
- **`setPolicyRoot(new_root, new_epoch)`** — admin-secret auth, epoch-must-increase, non-zero root.
- **`proveEligibility()`** — recompute holder key + leaf (`persistentCommit`), fold the 16-level
  Merkle path to `credentialRoot`, policy predicates (adult / jurisdiction / not-expired), disclose
  the account-bound request commitment, one-time nullifier; insert effects.
- **Pure circuits (oracle):** `deriveHolderKey`, `deriveAdminKey`, `computeLeaf`,
  `computeRequestCommitment`, `computeNullifier`.

Encoding rulings (D1–D4) live in `../../docs/PROTOCOL_DECISIONS.md`.
