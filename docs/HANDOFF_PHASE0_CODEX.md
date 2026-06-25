# Phase 0 Audit Handoff → Codex

**For:** Codex (Architect/Auditor)
**From:** Claude (Builder)
**Date:** 2026-06-24
**Scope of this handoff:** Phase 0 only (preflight + XRPL credential-enforcement protocol spike). No Midnight
contract, gateway, or app code exists yet. Requesting a sanity-check of the protocol evidence and the corrected
environment baseline before Phase 1 begins.

## 1. Repository path and branch

- WSL: `~/projects/midnight-xrpl-gateway`  (Windows UNC: `\\wsl.localhost\Ubuntu\home\denni\projects\midnight-xrpl-gateway`)
- Branch: `master`
- **Not pushed** anywhere (local only, per handoff "do not push unless Dennis asks").

## 2. Commit list by phase

| Phase | Commit | Subject |
|---|---|---|
| 0 | `ad12259` | Phase 0: XRPL credential enforcement protocol spike (gate green) |

## 3. Dirty-worktree status

Clean — `git status --porcelain` returns 0 files. (`spike-artifact.json` is gitignored.)

## 4. Toolchain versions (verified, not from memory)

| Component | Version | Note |
|---|---|---|
| OS | Windows 11 + WSL2 Ubuntu (Running) | **Codex 2026-06-24 note said "no WSL distro" — that was incorrect.** |
| Node (WSL) | v24.11.1 | via nvm at `~/.nvm/versions/node/v24.11.1` (not on non-interactive PATH by default) |
| Node (Windows) | v24.14.0 | |
| npm | 11.9.0 | |
| `xrpl` | 4.6.0 | matches X-Multi's pin; latest published is 5.0.0 |
| Compact dev tool | `compact` 0.5.1 | compilers up to 0.31.0 available; not yet pinned (Phase 2) |
| Docker | 29.4.3 | |
| Proof server | `midnightntwrk/proof-server:8.0.3` | already running on :6300 |

## 5. Verification command results

Phase 0 has one verification command (no lint/typecheck/unit suite yet — those arrive with Phase 1 TS):

- `npm run spike` → connects to XRPL testnet, funds 3 faucet wallets, runs the full lifecycle.
  **Result: GATE GREEN.** `NATIVE_CREDENTIAL_ENFORCEMENT_PROVEN: true`.

## 6. Contract address and public test transaction hashes

No Midnight contract yet. XRPL testnet spike hashes (all validated):

| Step | Hash | Result |
|---|---|---|
| CredentialCreate | `764DD56F7C8FC194F60DEC8EA8EF2A740ADCF5402971D89EEB418A225A759CE3` | tesSUCCESS |
| CredentialAccept | `2FB4438A95D643A08FF065DA0B65BFBD9A1CE51275088BAFAD10CB5BA967B5E9` | tesSUCCESS |
| EnableDepositAuth | `82EB8C5A372B57A98FC5CFB6930B4E2AE235CD5545F07B136A054046E31C36E7` | tesSUCCESS |
| DepositPreauth (cred-based) | `4A64025FBB6B4410C282CFFE73D20AA078A088940E9EB3538A2B900E5F965069` | tesSUCCESS |
| Payment w/o credential | `60A155F4EC9A9555A1DFBDF5FEB2E3BD0226387FA1F3F60BD9C9B71AF3B899AE` | **tecNO_PERMISSION** |
| Payment w/ credential | `3BD3B4A73C99525E355AD966DD0B3EAAC157BE2806B7F465DA949302B11E2FA2` | tesSUCCESS |
| CredentialDelete | `AC815311340BE89B5753F0049637AC2385A68F43EE9E959369E7AAAA0A008F5E` | tesSUCCESS |
| Payment after revocation | `3BA09C33A764D27DD53005873FD36FC68D4BE31EBEE8A55ED226EEED6837B948` | **tecBAD_CREDENTIALS** |

Accounts (testnet, ephemeral): issuer `rNLhTRVasVaHfjM8Jhh9PzmEJJmCU8uvdM`, user `rDMakCCz9k5utfCGDHyNnHXFaBEixQ2LtF`,
authorizer `rNpYkrvojMWJRL5YigmyJL18RZYBhzwcmg`. Full JSON in `docs/PROTOCOL_SPIKE.md`.

## 7. Known limitations (Phase 0)

- Faucet wallets are throwaway; the spike re-funds fresh accounts on each run, so hashes above are point-in-time
  evidence, not reusable fixtures.
- `submitAndWait` returning `tec*` (not throwing) is what lets the spike capture negative codes — relied upon.
- No Midnight side exercised yet; the cross-network privacy claims remain to be built and proven (Phases 1–2).

## 8. Files containing security-critical logic (so far)

- `scripts/spike-credentials.mjs` — the only code. Builds and submits real testnet transactions; signs only
  ephemeral faucet wallets it generated; redacts nothing sensitive because it handles no user secrets. This is a
  throwaway spike, **not** a component that ships — the production credential builder is Phase 4 and will be a
  fixed, no-arbitrary-fields builder.

## 9. Deviations from the Mission Profile

1. **Preflight finding contradicts the handoff's premise.** The handoff was written expecting WSL/Compact might be
   missing. They are present and healthy, so no reinstall/approval gate was needed. No scope change — just a
   greener-than-expected starting line.
2. **Open design choice deferred (not decided):** §8.4 `persistentCommit` vs `persistentHash` for the credential
   leaf. Will be decided in Phase 1/2 based on Compact-type/TS interop and documented with the rationale, per the
   Mission Profile's own guidance. Flagging now in case Codex has a preference.
3. `xrpl@4.6.0` chosen over latest 5.0.0 to match X-Multi's pin (the eventual integration target).

## 10. Requested from Codex

- Confirm the protocol evidence is acceptable as the Phase 0 exit gate.
- Any steer on the leaf-commitment primitive (§8.4) and the canonical XRPL AccountID→`Bytes<32>` padding direction
  (§8.6) before I lock the encoders in Phase 1 — these are the byte-layout decisions the Compact circuit must match
  exactly, so changing them later is the expensive kind of change.

No merge or deploy will happen before your audit, per the handoff.
