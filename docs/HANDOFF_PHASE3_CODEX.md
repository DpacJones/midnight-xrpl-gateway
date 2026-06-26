# Phase 3 Audit Handoff → Codex

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-25
**Scope:** Phase 3 only (XRPL account-binding challenge). Phases 0–2 already audited + green-lit. Phase 4+ not started.

## What's new since the Phase 2 audit
- **Commit `ce4d683`** — `packages/xrpl-client` (the only new code). Everything Phases 0–2 is unchanged from your
  green-lit review (`57ab991`) plus the doc-drift cleanup (`29823f6`).
- Branch `master`; audit-copy tip is this handoff commit. Worktree clean.

## Objective (Mission Profile §10)
Prove control of the subject XRPL account WITHOUT submitting anything: the user signs an intentionally
non-submittable self-payment whose memo binds the Midnight request; the gateway (Phase 4) verifies it. This is the
component that must NOT repeat the historical Atlantis login-signature vuln (a decoded tx trusted without verifying
its signature).

## Files (security-critical)
- `packages/xrpl-client/src/challenge.ts` — `buildChallenge` + `verifyChallenge`.
- `packages/xrpl-client/test/challenge.test.ts` — §17.3 adversarial suite (11 tests).

## Canonical challenge (all fields fixed; deviations rejected)
```
TransactionType: Payment
Account == Destination == subject
Amount: "1"   Fee: "1"   Sequence: 0   Flags: 0   LastLedgerSequence: 1
Memos: [{ Memo: { MemoType: hex("MXRPL_V1"),
                  MemoData: policyId32(32) || epoch(2 BE) || requestCommitment(32) || requestNonce(32) } }]
```
`LastLedgerSequence: 1` + `Sequence: 0` make it non-submittable by construction.

## verifyChallenge — fail-closed checks (please scrutinize)
1. **Cryptographic signature verification** via `xrpl.verifySignature(signedBlob)` — NOT a bare `decode`. Rejects
   missing `TxnSignature`/`SigningPubKey` first.
2. **Key→account binding:** `deriveAddress(SigningPubKey) === Account` (defends sign-with-own-key-claim-other-account).
3. **Exact canonical shape:** strict field allowlist (any field outside
   {TransactionType, Account, Destination, Amount, Fee, Sequence, Flags, LastLedgerSequence, Memos, SigningPubKey,
   TxnSignature} → reject); `Account==Destination`, `Amount=="1"`, `LastLedgerSequence==1`, `Sequence==0`.
4. **Account binding to the request:** optional `expected.account` must equal `Account`.
5. **Memo binding:** exactly one memo, `MemoType=="MXRPL_V1"`, `MemoData` is exactly 98 bytes and decodes to
   the expected (policy_id, epoch, request_commitment, request_nonce).

## Adversarial test coverage (§17.3) — all pass
valid · unsigned · wrong signing key (derive mismatch) · account mismatch vs expected · destination mismatch ·
wrong amount · wrong LastLedgerSequence · **post-sign memo tamper → invalid signature** · unexpected field ·
memo field mismatches (commitment/epoch/nonce/policy) · nonce wrong length (build-time).

## Verification
`node --test` (repo root): **62 tests pass, 0 fail** (51 Phases 0–2 + 11 Phase 3). Run in WSL (Node v24.11.1).

## Notes / possible audit points
- The challenge fixes `Fee:"1"` and `Sequence:0`; the verifier requires `Sequence==0` but does not constrain `Fee`
  (Fee can't make the tx submittable given LLS=1/Seq=0, but flag if you'd prefer it pinned too).
- Memo `epoch` is a 2-byte big-endian `Uint<16>`, matching the contract's `policy_epoch` width.
- No network calls — pure build/verify over a blob. The gateway (Phase 4) supplies `expected` from the request +
  the Phase 0 protocol shapes.

No merge/deploy before your audit. Decisions index: `docs/PROTOCOL_DECISIONS.md`.
