# Phase 0 — XRPL Credential Enforcement Protocol Spike

**Status:** ✅ GATE GREEN — native credential-gated Deposit Authorization is enforced by XRPL testnet, under a
strict per-step assertion (every step must return its *exact* expected result code and be validated).
**Date:** 2026-06-25 (hardened re-run; see "Audit response" below)
**Network:** XRPL Testnet — `wss://s.altnet.rippletest.net:51233`
**Client:** `xrpl@4.6.0` (matches X-Multi's pinned version; latest published is 5.0.0)
**Script:** `scripts/spike-credentials.mjs` (`npm run spike`)

This spike is the gating exit for the whole mission (Mission Profile §16 Phase 0). It proves — against the live
ledger, with real validated transactions — that an XRPL account is denied a payment to a deposit-authorization
destination unless it holds an *accepted* credential of a specific issuer+type, and that deleting the credential
re-blocks the payment. No Midnight or Compact component is involved here; this isolates the XRPL enforcement
assumption the architecture depends on.

## Result summary (the strict gate)

The gate passes only if **all 8 steps** produce their exact expected code **and** `validated === true`; `failures`
must be empty and the step count must equal the expected count.

| Step | Expected | Observed | Pass |
|---|---|---|---|
| CredentialCreate | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| CredentialAccept | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| EnableDepositAuth (`asfDepositAuth`) | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| DepositPreauth (credential-based) | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| Payment **without** credential | `tecNO_PERMISSION` | `tecNO_PERMISSION` | ✅ |
| Payment **with** accepted credential | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| CredentialDelete | `tesSUCCESS` | `tesSUCCESS` | ✅ |
| Payment after revocation | `tecBAD_CREDENTIALS` | `tecBAD_CREDENTIALS` | ✅ |

`NATIVE_CREDENTIAL_ENFORCEMENT_PROVEN: true` (`stepsRun: 8 / stepsExpected: 8`, `failures: []`).

## Test accounts (fresh testnet faucet wallets, ephemeral — seeds never persisted)

| Role | Address |
|---|---|
| Credential issuer (gateway role) | `r42p6zuudgYSVHHqK3rgaHmmhwoVMqPLDd` |
| User / subject / payment sender | `rL6R6fce1bfTxgj1S7mxQ2f4EBonv6wbyB` |
| Authorizer / deposit-auth recipient | `rUxTg1hxQvHMy9higXUEL2LWeNtz3PgGvw` |

`CredentialType` label `ATL_MIDNIGHT_ELIGIBLE_V1` → hex `41544C5F4D49444E494748545F454C494749424C455F5631`
(ASCII→hex via `xrpl.convertStringToHex`, uppercased; 24 bytes, within the 64-byte field limit).

## Validated lifecycle (hashes + ledger index)

All transactions returned `validated: true`. The full machine-readable record — including each **submitted
(autofilled) transaction** with its `Fee`, `Sequence`, and `LastLedgerSequence` — is written to
`spike-artifact.json` (gitignored; only public addresses + public credential metadata; regenerate with
`npm run spike`).

| # | Step | Tx hash | Ledger | Result |
|---|---|---|---|---|
| 1 | CredentialCreate | `AA1D9061AA4825E72C37914C492405957BBF684BAEF20A949C96DCF64E0FFD69` | 18524391 | `tesSUCCESS` |
| 2 | CredentialAccept | `FBBAECE9F5B4D09B0F507450F00F8CA85F307A335C37582A9469616BACBF0B88` | 18524393 | `tesSUCCESS` |
| 3a | AccountSet (asfDepositAuth=9) | `4F4E8B2AB1DC8FE2C3BE9BB749B6C77DD5EFE02D467C0B36892B813B5443F040` | 18524395 | `tesSUCCESS` |
| 3b | DepositPreauth (credential-based) | `06CEE164D1659E9B681655683639F4BA5FC988057A9691ADEB742E9571A7F60A` | 18524397 | `tesSUCCESS` |
| 4 | Payment **without** credential | `38AA45D580020740C48BAA5441621BD6FCC417CF7EA0099C98A6100CA6DC51B6` | 18524399 | **`tecNO_PERMISSION`** |
| 5 | Payment **with** credential | `F62B60CC2EC2AD7DD5BED14D59FCABF03D43849B4259F9CD56D9B0D676CE1ED9` | 18524401 | `tesSUCCESS` |
| 6 | CredentialDelete | `C8E82DBE6C5F0C71F62BCDB109EBF749901C9E7C404111D3B591ACDFF18BF9EE` | 18524402 | `tesSUCCESS` |
| 7 | Payment after revocation | `8EE83A51B9844F26C2A9CB8555753C02CC77B697EE3115887D83B1857A5E1DFE` | 18524403 | **`tecBAD_CREDENTIALS`** |

### Exact protocol JSON shapes confirmed against `xrpl@4.6.0`

**CredentialCreate** (issuer signs):
```json
{ "TransactionType": "CredentialCreate", "Account": "<issuer>", "Subject": "<user>", "CredentialType": "<hex>" }
```
**CredentialAccept** (subject signs):
```json
{ "TransactionType": "CredentialAccept", "Account": "<user>", "Issuer": "<issuer>", "CredentialType": "<hex>" }
```
**Enable Deposit Authorization** (authorizer signs): `AccountSet` with `SetFlag: 9` (`asfDepositAuth`).
**DepositPreauth, credential-based** (authorizer signs):
```json
{ "TransactionType": "DepositPreauth", "Account": "<authorizer>",
  "AuthorizeCredentials": [ { "Credential": { "Issuer": "<issuer>", "CredentialType": "<hex>" } } ] }
```
**Credential-gated Payment** (user signs): standard `Payment` plus
```json
"CredentialIDs": [ "<credentialLedgerEntryId>" ]
```
**CredentialDelete** (issuer signs):
```json
{ "TransactionType": "CredentialDelete", "Account": "<issuer>", "Subject": "<user>", "CredentialType": "<hex>" }
```

## Credential ledger-entry ID derivation method

The `CredentialIDs` field needs the ledger-entry **index** of the accepted Credential object. Method used and
confirmed:

1. After `CredentialAccept`, query the **subject** account's objects:
   ```
   account_objects { account: <user>, type: "credential", ledger_index: "validated" }
   ```
2. Match the entry whose `Issuer == <issuer>` and `CredentialType == <hex>`.
3. Use that entry's `.index` field as the credential id.
4. Acceptance is asserted via the `lsfAccepted` flag (`0x00010000`) on the object → must be `true` before the
   gated payment is attempted (the spike throws otherwise).

Resolved id this run: `DCD27FC66599936F98DBC84240D9D5A0499597FF945AAE51D5EDF567FF6CDEFC`.

> Note: `Client.submitAndWait()` returns `tec*` results normally (the tx is validated-but-failed); it does not
> throw for `tecNO_PERMISSION` / `tecBAD_CREDENTIALS`. Only malformed (`tem*`) submissions throw. The spike relies
> on this to capture negative-path codes, and the client is closed in a `finally` block so a mid-run failure can't
> leak a live connection.

## Audit response (Codex, 2026-06-25)

Codex accepted the Phase 0 gate and independently re-verified the original run's eight hashes/ledgers/flags. Three
findings were addressed and the spike was re-run (hence the new hashes/accounts above; the original Codex-verified
run is preserved in git history at commit `ad12259`):

1. **Strict gate (was too permissive).** The script now asserts each step's *exact* expected result code and
   `validated === true`; "any non-`tesSUCCESS`" denial is no longer accepted.
2. **Artifact now records the submitted transaction.** Each step stores the autofilled tx actually signed —
   including `Fee`, `Sequence`, `LastLedgerSequence`, `Flags` — not the pre-autofill template.
3. **Connection cleanup.** The XRPL client is disconnected in a `finally` block.

## Implications for later phases

- Phase 4 gateway's fixed `CredentialCreate` builder is shape-verified above — no arbitrary tx fields needed.
- The deny code for an unauthorized deposit-auth payment is `tecNO_PERMISSION`; the revoked/invalid-credential
  code is `tecBAD_CREDENTIALS`. The E2E tests (§17.5) should assert these exact codes.
- Credential id must be resolved from the **subject's** `account_objects`, not derived client-side — recorded as
  the canonical method for the `xrpl-client` package.
