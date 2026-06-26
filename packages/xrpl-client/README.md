# @mxrpl/xrpl-client

XRPL account-binding challenge (Mission Profile §10). The user proves control of the subject XRPL
account by signing an intentionally **non-submittable** self-payment whose memo binds the Midnight
request; the gateway verifies it.

## Surface
- `buildChallenge(fields)` — the canonical unsigned challenge tx. The user signs it locally
  (`wallet.sign(buildChallenge(...))`); the resulting `tx_blob` is the gateway's `signedChallengeBlob`.
- `verifyChallenge(signedBlob, expected)` — fail-closed verification → `{ ok, reasons, account? }`.

## Why it's safe
- **Real cryptographic signature verification** (`xrpl.verifySignature`), not a bare `decode`. This is the
  class of bug the historical Atlantis login-signature vuln was (trusting a decoded tx without verifying it).
- **Key→account binding:** `deriveAddress(SigningPubKey) === Account` (sign-with-own-key-claim-other-account is rejected).
- **Exact canonical shape:** `Account==Destination`, `Amount=="1"`, `LastLedgerSequence==1`, `Sequence==0`, and a
  strict field allowlist — **unexpected fields are rejected** so meaning can't be smuggled in.
- **Non-submittable by construction:** `LastLedgerSequence:1` + `Sequence:0`.
- **Memo binds** `policy_id || epoch(2 BE) || request_commitment || request_nonce` under `MemoType "MXRPL_V1"`.

## Tests
`node --test` — 11 adversarial cases (§17.3): valid, unsigned, wrong key, account/destination/amount/LLS
mismatch, post-sign memo tamper (breaks signature), unexpected field, memo field mismatches, nonce length.
