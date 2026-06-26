# @mxrpl/gateway

The scoped credential gateway (Mission Profile §11). It verifies a confirmed Midnight eligibility
receipt + proof of XRPL account control, then issues **exactly one fixed** `CredentialCreate`. It
is an explicitly trusted issuer — **not** a custodian, relayer, or arbitrary transaction signer.

## Fail-closed pipeline (`createGateway(config, deps).issueCredential(req)`)
1. Strict format/length validation (32-byte hex fields, valid r-address, `Uint<16>` epoch).
2. Allowlist: the request's Midnight contract + policy must equal the configured ones.
3. **Real** XRPL challenge verification (`@mxrpl/xrpl-client`).
4–6. Derive the AccountID, recompute the request commitment, require exact equality.
7–9. Confirm the commitment is in the configured contract's `approvedRequests` (validated state).
10. Durable idempotency — key `(network, policy_id, request_commitment)`; never issues twice.
11. If the XRPL credential already exists, return it deterministically.
12–16. Build the fixed `CredentialCreate`, sign only with the configured issuer, submit, wait, persist.

Any failed step throws `GatewayError` **before** anything is persisted — a failed XRPL submit does
not mark the request complete, so a retry can proceed.

## Safety
- **Hard mainnet guard:** `assertSafeConfig` (run at construction) throws if `xrpl.network !== "testnet"`
  or the endpoint looks like mainnet.
- **No arbitrary signing:** the request has no tx-type/issuer/field inputs; `buildCredentialCreate`
  emits only `{TransactionType, Account, Subject, CredentialType, Memos[, Expiration, URI]}` from config.
- Issuer seed is constructor-supplied (local `.env`), never part of a request, and must match the
  configured issuer account.

## Boundaries (injected)
- `MidnightReceiptProvider` — reads validated `approvedRequests` (the indexer in production; mock in tests).
- `XrplCredentialIssuer` — `createXrplCredentialIssuer(config, seed)` is the real impl (build/sign/submit
  to testnet, resolve the credential id); §17.4 unit tests use a mock.
- `IdempotencyStore` — `InMemoryIdempotencyStore` / `FileIdempotencyStore` (atomic file writes). Concurrent
  duplicates are serialized by an **in-process per-key critical section** (only one credential is ever issued;
  tested with a racing-duplicate). ⚠️ **Single-process scope** — multiple gateway processes against one store need a
  real atomic claim (DB unique constraint / advisory lock); run a single process or swap the store before scaling out.

## Tests
`node --test` — 12 §17.4 cases (mocked boundaries): happy path, missing/wrong-contract/wrong-policy/
wrong-epoch receipt, commitment mismatch, idempotency, concurrent-duplicate (issues once), existing credential,
submit-failure-not-persisted, fixed-tx-type, mainnet guard.

> The real `MidnightReceiptProvider` (indexer query of `approvedRequests`) and a live end-to-end issue
> are wired in Phase 5 (needs the deployed contract + indexer). The pipeline logic + fixed builder +
> idempotency + guards are complete and tested here.
