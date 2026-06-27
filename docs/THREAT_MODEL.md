# Threat Model

Scope: the v1 standalone reference dApp (testnet, synthetic attributes). It names the actors, the
trust boundaries, the attacks considered, the implemented defenses, and the residual risks you must
accept before trusting this in any real setting.

## Actors

| Actor | Controls | Trusted for |
|---|---|---|
| **User** | holder secret, credential bundle, XRPL keys, proof submission, `CredentialAccept`, gated payment | nothing (the system is adversarial toward the user) |
| **Issuer** (mock in v1) | the credential Merkle tree + root rotation; the **truth of source attributes** | attribute truth + root integrity (a real deployment would use a KYC provider / regulated body) |
| **Admin** | the `setPolicyRoot` key (root + epoch rotation) | publishing correct roots; monotonic epochs |
| **Gateway** | the XRPL **issuer seed**; reads Midnight state; issues `CredentialCreate` | observing Midnight correctly + issuing only the configured credential |
| **XRPL authorizer** | Deposit Authorization + credential-based `DepositPreauth` | nothing extra — it just demonstrates ledger-level utility |

## Trust boundaries & defenses

### 1. Witness trust boundary (Midnight circuit)
Private witnesses are attacker-controlled. The circuit never trusts them implicitly:
- **Admin auth is not `ownPublicKey()`** — `setPolicyRoot` requires `H(ADMIN, admin_secret) == admin`
  (the stored admin key). A caller cannot claim admin by being any wallet.
- **Membership is proven, not asserted** — the leaf must Merkle-resolve to the *current published root*
  (historic roots are rejected, so revocation via root rotation is real).
- **Policy predicates are in-circuit** — `schema==1`, age, jurisdiction, and `valid_until ≥ epoch` are
  asserted on the witnessed values; "root purity" is not a hidden off-chain assumption.
- **Nullifier replay** — `H(NULLIFIER, holder_secret, policy_id, credential_id)` is recorded; one
  credential authorizes exactly one XRPL account under one policy.
- **Account binding** — `request_commitment` folds the XRPL AccountID in-circuit, so another account
  cannot claim someone else's eligibility receipt.

### 2. Proof-of-account-control (gateway ⇄ XRPL challenge)
The historical Atlantis login-signature bug (trusting a decoded tx without verifying its signature)
is explicitly defended:
- **Real cryptographic verification** (`xrpl.verifySignature`), not a bare `decode`.
- **Key→account binding** (`deriveAddress(SigningPubKey) === Account`).
- **Exact canonical shape** — strict top-level field allowlist + nested-memo allowlist; pinned
  `Account==Destination`, `Amount=="1"`, `Fee=="1"`, `Flags==0`, `LastLedgerSequence==1`, `Sequence==0`.
  Unexpected fields (top-level or nested) are rejected; the challenge is non-submittable by construction.

### 3. Gateway issuance (fail-closed)
- **No arbitrary signing** — the request has no tx-type/issuer/field inputs; the builder emits exactly
  `{TransactionType:"CredentialCreate", Account, Subject, CredentialType, Memos[, Expiration, URI]}`
  from server config + the verified subject + the request commitment.
- **Receipt-gated** — issues only after confirming the commitment is in the configured contract's
  `approvedRequests` (validated indexer state); it decides nothing independently of Midnight.
- **Hard mainnet guard** — construction fails for non-testnet / mainnet-looking endpoints.
- **Idempotent** — a per-key critical section + durable store; never issues twice, even under
  concurrent duplicates. A failed XRPL submit is *not* persisted, so retries are safe.
- **Rate limited (post-auth)** — the per-subject limiter runs *after* the challenge proves account
  control, so a caller cannot burn another subject's bucket (no spoofed-subject DoS). It sheds load
  before the indexer query + submit. It is **not** a complete abuse defense — a deployment should add a
  pre-auth transport-layer limit (IP / API key), since challenge verification runs before this.
- **Redacted, best-effort logs** — only an allowlist of safe fields; never the signed blob or the
  request nonce; and logging errors can never affect issuance control flow (`safeLog` wrapper).

## Attacks considered (and why they fail)
- *Forge an eligibility receipt for an account you don't control* → the challenge's signature +
  `deriveAddress==Account` + the in-circuit account binding all fail.
- *Replay a credential to a second account* → same nullifier ⇒ circuit rejects.
- *Smuggle a real Destination/Amount past the challenge* → field allowlist + pinned values reject it.
- *Get the gateway to sign anything but a CredentialCreate* → structurally impossible (fixed builder).
- *Race two duplicate requests into two credentials* → per-key critical section ⇒ one issue.
- *Use a non-v1 / underage / wrong-jurisdiction credential that's in the tree* → in-circuit asserts reject.
- *Point the gateway at mainnet* → startup guard refuses.

## Residual risks (you must accept these)
1. **The gateway is trusted** to observe Midnight correctly and issue the configured credential.
   **Issuer-key compromise ⇒ false credential issuance.** Production needs real key custody.
2. **XRPL does not verify the Midnight proof** — it enforces the credential the trusted gateway issued.
3. **The source-attribute issuer is trusted** for the truth of the underlying attributes.
4. **Cross-chain correlation** — timing + the `CredentialCreate` memo (the request commitment) link the
   public XRPL credential to the opaque Midnight receipt. The *attributes* stay private; the *fact of
   authorization* for a specific XRPL account is public by design.
5. **Single-process** idempotency store + rate limiter — a multi-process deployment needs shared ones.
6. **Synthetic test data**, testnet only — not a legal KYC system.

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for the full list and the non-goals.
