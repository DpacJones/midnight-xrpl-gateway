# Phase 0 — XRPL Credential Enforcement Protocol Spike

**Status:** ✅ GATE GREEN — native credential-gated Deposit Authorization is enforced by XRPL testnet.
**Date:** 2026-06-24
**Network:** XRPL Testnet — `wss://s.altnet.rippletest.net:51233`
**Client:** `xrpl@4.6.0` (matches X-Multi's pinned version; latest published is 5.0.0)
**Script:** `scripts/spike-credentials.mjs` (`npm run spike`)

This spike is the gating exit for the whole mission (Mission Profile §16 Phase 0). It proves — against the
live ledger, with real validated transactions — that an XRPL account can be denied a payment unless it holds an
*accepted* credential of a specific issuer+type, and that deleting the credential re-blocks the payment. No
Midnight or Compact component is involved here; this isolates the XRPL enforcement assumption the architecture
depends on.

## Result summary (the gate)

| Assertion | Observed result code | Pass |
|---|---|---|
| Payment to deposit-auth account **without** `CredentialIDs` | `tecNO_PERMISSION` | ✅ blocked |
| Payment **with** accepted matching `CredentialIDs` | `tesSUCCESS` | ✅ allowed |
| Payment with **deleted** credential id | `tecBAD_CREDENTIALS` | ✅ re-blocked |

`NATIVE_CREDENTIAL_ENFORCEMENT_PROVEN: true`

## Test accounts (fresh testnet faucet wallets, ephemeral — seeds never persisted)

| Role | Address |
|---|---|
| Credential issuer (gateway role) | `rNLhTRVasVaHfjM8Jhh9PzmEJJmCU8uvdM` |
| User / subject / payment sender | `rDMakCCz9k5utfCGDHyNnHXFaBEixQ2LtF` |
| Authorizer / deposit-auth recipient | `rNpYkrvojMWJRL5YigmyJL18RZYBhzwcmg` |

`CredentialType` label `ATL_MIDNIGHT_ELIGIBLE_V1` → hex `41544C5F4D49444E494748545F454C494749424C455F5631`
(ASCII→hex via `xrpl.convertStringToHex`, uppercased; 24 bytes, within the 64-byte field limit).

## Validated lifecycle (exact JSON + hashes + ledger index)

All transactions returned `validated: true`. Full machine-readable copy in `spike-artifact.json` (gitignored — it
contains only public addresses and public credential metadata; regenerate with `npm run spike`).

| # | Step | Tx hash | Ledger | Result |
|---|---|---|---|---|
| 1 | CredentialCreate | `764DD56F7C8FC194F60DEC8EA8EF2A740ADCF5402971D89EEB418A225A759CE3` | 18519175 | `tesSUCCESS` |
| 2 | CredentialAccept | `2FB4438A95D643A08FF065DA0B65BFBD9A1CE51275088BAFAD10CB5BA967B5E9` | 18519177 | `tesSUCCESS` |
| 3a | AccountSet (asfDepositAuth=9) | `82EB8C5A372B57A98FC5CFB6930B4E2AE235CD5545F07B136A054046E31C36E7` | 18519178 | `tesSUCCESS` |
| 3b | DepositPreauth (credential-based) | `4A64025FBB6B4410C282CFFE73D20AA078A088940E9EB3538A2B900E5F965069` | 18519179 | `tesSUCCESS` |
| 4 | Payment **without** credential | `60A155F4EC9A9555A1DFBDF5FEB2E3BD0226387FA1F3F60BD9C9B71AF3B899AE` | 18519181 | **`tecNO_PERMISSION`** |
| 5 | Payment **with** credential | `3BD3B4A73C99525E355AD966DD0B3EAAC157BE2806B7F465DA949302B11E2FA2` | 18519182 | `tesSUCCESS` |
| 6 | CredentialDelete | `AC815311340BE89B5753F0049637AC2385A68F43EE9E959369E7AAAA0A008F5E` | 18519184 | `tesSUCCESS` |
| 7 | Payment after revocation | `3BA09C33A764D27DD53005873FD36FC68D4BE31EBEE8A55ED226EEED6837B948` | 18519185 | **`tecBAD_CREDENTIALS`** |

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
4. Acceptance was confirmed via the `lsfAccepted` flag (`0x00010000`) on the object → `true`.

Resolved id this run: `99CE45789B7F04A1113EF13D4685255A06797903431EB9169F692468B2071881`.

> Note: `Client.submitAndWait()` returns `tec*` results normally (the tx is validated-but-failed); it does not
> throw for `tecNO_PERMISSION` / `tecBAD_CREDENTIALS`. Only malformed (`tem*`) submissions throw. The spike relies
> on this to capture negative-path codes.

## Implications for later phases

- Phase 4 gateway's fixed `CredentialCreate` builder is shape-verified above — no arbitrary tx fields needed.
- The deny code for an unauthorized deposit-auth payment is `tecNO_PERMISSION`; the revoked/invalid-credential
  code is `tecBAD_CREDENTIALS`. The E2E tests (§17.5) should assert these exact codes.
- Credential id must be resolved from the **subject's** `account_objects`, not derived client-side — recorded as
  the canonical method for the `xrpl-client` package.
