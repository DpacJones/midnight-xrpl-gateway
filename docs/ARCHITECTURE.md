# Architecture

## The division of responsibility

| Layer | Responsibility | What it never does |
|---|---|---|
| **Midnight** (`PrivateCredentialGateway.compact`) | privately prove policy satisfaction; prevent duplicate proof use; record an opaque, account-bound receipt | learn the XRPL address text, DOB, jurisdiction input, or holder secret |
| **Gateway** (`packages/gateway`) | bind the verified Midnight receipt to an XRPL account; issue **one** narrowly-defined XRPL credential | hold funds, sign for the user, accept arbitrary tx fields, or decide eligibility independently of the receipt |
| **XRPL** | store, accept, enforce, and revoke the account-bound credential | verify the Midnight proof (it can't — see Privacy Boundary) |
| **User wallet** | hold secrets; sign every tx involving the user's XRPL account | upload raw attributes or the holder secret to the gateway |

The gateway is an **explicitly trusted credential issuer and cross-network observer** — not a
trustless bridge, custodian, or general relayer.

## End-to-end flow

1. **Issue (off-chain, mock issuer).** The user generates `holder_secret`; only `holder_key =
   H(HOLDER, holder_secret)` goes to the issuer. The issuer builds a `credential_leaf =
   persistentCommit(CRED_LEAF, schema, credential_id, holder_key, birth_year, jurisdiction,
   valid_until; issuer_randomness)`, inserts it into the current Merkle tree, and (admin) publishes
   the new root + epoch via `setPolicyRoot`.
2. **Prove (Midnight, real ZK).** `proveEligibility()` re-derives the holder key + leaf, verifies
   the 16-level Merkle path resolves to the published root, asserts the policy (`schema==1`,
   `birth_year ≤ adult_cutoff`, `jurisdiction == allowed`, `valid_until ≥ epoch`), recomputes the
   account-bound `request_commitment = H(REQUEST, xrpl_account_id, nonce, policy_id, epoch)`,
   rejects a reused `nullifier = H(NULLIFIER, holder_secret, policy_id, credential_id)`, and records
   the disclosed nullifier + request commitment in ledger state. The proof is verified by the ledger.
3. **Bind (XRPL challenge).** The user signs an intentionally **non-submittable** self-payment
   (`Account==Destination`, `Amount "1"`, `LastLedgerSequence 1`, `Sequence 0`) whose memo binds
   `policy_id ‖ epoch ‖ request_commitment ‖ nonce`. This proves control of the subject account.
4. **Issue credential (gateway).** The gateway runs a fail-closed pipeline (below), reads
   `approvedRequests` from the deployed contract's validated state via the indexer, and submits a
   **fixed** `CredentialCreate` from the configured issuer account.
5. **Enforce (XRPL).** The user `CredentialAccept`s; an authorizer with Deposit Authorization +
   credential-based `DepositPreauth` accepts credential-gated payments. Without the credential the
   payment fails (`tecNO_PERMISSION`); with it, `tesSUCCESS`; after `CredentialDelete`,
   `tecBAD_CREDENTIALS`.

## Gateway fail-closed pipeline (`createGateway(config, deps).issueCredential`)

Every step must pass, in order; any failure throws **before** anything is persisted:

1. strict format/length validation (32-byte hex, valid r-address, `Uint<16>` epoch)
2. **rate limit** per subject (sheds load before expensive work)
3. allowlist: request's Midnight contract + policy must equal the configured ones
4. **real** XRPL challenge signature verification (`xrpl.verifySignature` + `deriveAddress == Account`)
5. recompute the request commitment, require exact equality
6. confirm the commitment is in `approvedRequests` (validated indexer state)
7. durable idempotency (per-key critical section — never issues twice)
8. if the credential already exists, return deterministically
9. build the **fixed** `CredentialCreate`, sign only with the configured issuer, submit, wait, persist

`MidnightReceiptProvider`, `XrplCredentialIssuer`, `IdempotencyStore`, `GatewayLogger`, and
`RateLimiter` are injected — the §17.4 tests mock the external boundaries; `apps/e2e-harness` wires
the real ones.

## Encoding (normative = Compact; TS conforms)

The TypeScript core is an **independent** implementation that must match the circuit byte-for-byte;
the compiled `pureCircuits.*` are the conformance oracle (cross-checked in tests). The key rulings
(`docs/PROTOCOL_DECISIONS.md`):

- **D1** — credential leaf uses `persistentCommit` (32-byte opening), not `persistentHash`.
- **D2** — XRPL AccountID → `Bytes<32>` = the raw 20-byte AccountID left-padded with 12 zero bytes.
- **D3** — domain tags are `pad(32, "ascii")` (UTF-8 right-pad); integers hash with their native
  `Uint<N>` type inside heterogeneous tuples (not sha256 tags / not big-endian widening).
- **D4** — a custom fixed-depth (16) `persistentHash` Merkle tree (off-chain build + published root),
  not the stdlib `MerkleTree` ADT — keeps TS and circuit identical by construction; upgrade-stable root.

## Components

```
packages/private-credential-core   constants, bytes, account-id (D2), hash (D1/D3), credential,
                                   merkle (D4), bundle, mock issuer CLI, golden vectors
packages/xrpl-client               buildChallenge / verifyChallenge (real signature verification)
packages/gateway                   pipeline, config + mainnet guard, fixed CredentialCreate builder,
                                   idempotency, logger, rate limiter, real XRPL issuer
contracts/private-credential-gateway  PrivateCredentialGateway.compact (ledger, setPolicyRoot,
                                   proveEligibility, pure-circuit oracles) + witnesses
apps/e2e-harness                   wallet/providers SDK glue, deploy/join, real MidnightReceiptProvider,
                                   deploy-and-prove + the full run-e2e lifecycle
```
