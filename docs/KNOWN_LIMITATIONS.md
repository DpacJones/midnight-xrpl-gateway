# Known Limitations

Read this before trusting the gateway in any real setting. Nothing here is hidden in the code; it is
all stated so the trust assumptions are explicit (the project's honesty posture).

## Trust & security
1. **The gateway is trusted** to observe Midnight correctly and to issue the configured XRPL
   credential. It is not trustless.
2. **XRPL does not verify the Midnight proof.** XRPL enforces the credential the trusted gateway
   issued; it has no Midnight ZK verifier (and there is no in-process verifier to inline).
3. **The source-attribute issuer is trusted** for the truth of the underlying attributes (in v1 a
   local mock; in production a KYC provider / government / regulated body).
4. **Issuer-key compromise ⇒ false credential issuance.** The XRPL issuer seed is held by the gateway
   process; v1 keeps it in a local `.env`. Production needs real key custody (HSM / KMS).
5. **Root rotation is issuer/admin controlled.** Revocation works by rotating the published root +
   bumping the epoch; this depends on the admin behaving correctly.

## Privacy
6. **The XRPL account and credential type are public**, as is the *fact* of authorization for that
   account. Only the attributes/evidence are private.
7. **Cross-chain correlation is by design** — timing + the `CredentialCreate` memo (the request
   commitment) link the public XRPL credential to the opaque Midnight receipt. A UI must disclose this
   and must not claim anonymity. See `PRIVACY_BOUNDARY.md`.
7b. **Hosted proving sees the witnesses.** ZK proving needs the private witnesses as input; with a
   *hosted* prover (this dApp connects via 1AM, whose prover is `api-preview.1am.xyz` on Preview), the
   prover operator sees them during proof generation. They never go on-chain. For full locality, prove
   against a *local* proof server (Lace » Settings » Midnight » Local, or run your own).

## Operational / scale
8. **Single-process** idempotency store (`FileIdempotencyStore`) and rate limiter — correct within one
   process, but a multi-process deployment needs a shared atomic claim + limiter (e.g. SQLite/DB/Redis).
9. **Proving cost** — `proveEligibility` takes **~16–25 s** (a depth-16 `persistentHash` Merkle fold;
   ruling D4). Acceptable for the demo; revisit toward the stdlib field-Merkle ADT if a real deployment
   needs lower latency (measurement-driven, per D4).
10. **Real proving is generated, not yet submitted to a public chain in the harness's prove-only path**
    — the prove harness proves locally against the proof server (no node/indexer/wallet); the full E2E
    *does* submit `proveEligibility` to the local devnet and verify it on-chain.

## Scope / data
11. **Synthetic test data, testnet only.** Attributes (`birth_year`, `jurisdiction`) are demo values,
    not real KYC. No mainnet deployment.
12. **One policy in v1** — *adult + allowed jurisdiction* (`adult_cutoff_year=2008`, `allowed=CA`,
    `epoch=1`), `schema==1`. One private credential → one XRPL credential under one policy; renewal /
    multi-application reuse are later protocol versions, not implicit behaviour.
13. **No X-Multi integration** in this repo (the standalone passed E2E first, as designed; the X-Multi
    eligibility panel is the sanctioned next step, preserving the nested-multisig prohibition).
14. **Conformance trust** — the TS core conforms to the compiled `pureCircuits.*`; if the contract is
    recompiled with a different compiler/runtime pair, regenerate the bindings and re-run the
    conformance test (the version pairing is the #1 Midnight footgun).

## Explicit non-goals (v1)
No mainnet, no real PII, no claim XRPL verifies Midnight proofs, no custom Plonk verifier in JS, no
arbitrary transaction-signing API, no custody of user funds/keys, no "magic bridge" language, no
Authorized-Trust-Line / MPT / Permissioned-Domain adapters yet (post-v1, §20), no full ProofPass
product (only the minimal core the gateway needs).
