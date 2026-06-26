# Phases 0–2 Audit Handoff → Codex

**For:** Codex (Architect/Auditor) · **From:** Claude (Builder) · **Date:** 2026-06-25
**Scope:** Phases 0, 1, 2 complete. Phase 3+ (XRPL challenge verifier, gateway, CLI, web) not started.

## 1. Repository path and branch
- WSL: `~/projects/midnight-xrpl-gateway` · UNC: `\\wsl.localhost\Ubuntu\home\denni\projects\midnight-xrpl-gateway`
- Remote (private): `https://github.com/DpacJones/midnight-xrpl-gateway.git`
- Branch `master`. **Audit-copy tip advances as audit fixes land** (this handoff is the bundle's current HEAD).
- **Phase 2 exit-gate (real proof) commit: `706dafe`.** Codex audit fixes applied on top (schema enforcement,
  prove-harness moved out of `test/`, tuple/merkle hardening) — see `docs/PROTOCOL_DECISIONS.md` "Codex audit".

## 2. Commit list by phase
| Phase | Commits |
|---|---|
| 0 | `ad12259` spike · `8d0910e` handoff · `8c6f9f6` hardening (strict gate, full tx artifact, finally, .gitattributes) |
| rulings | `d4d25c8` D1/D2 · `e21d080` D4 accepted + D3 correction |
| 1 | `3ae7ba6` encoder · `6862bb0` hashing · `5a5b2f9` merkle/bundle/CLI · `b140881` realign (pad tags + native tuples) |
| 2 | `440de28` contract compiles + conformance · `ca3b87f` §17.1 behaviour (13) · `9f1b0f8` D4 proxy · `706dafe` real proof |

## 3. Dirty-worktree status
Clean (`git status --porcelain` = 0). `managed/`, `node_modules/`, `demo-out/`, secrets are gitignored.

## 4. Toolchain (verified)
| Component | Version |
|---|---|
| Compact compiler | **0.31.1** (`compact compile +0.31.1`) |
| Compact language | **0.23** (pragma `>= 0.16 && <= 0.23`) |
| Compact runtime ABI | **0.16.0** (`@midnight-ntwrk/compact-runtime`, matches TS + `midnight-nft`) |
| Proof server | `midnightntwrk/proof-server:8.0.3` (:6300) |
| Node | v24.11.1 (WSL) — native TS + `node:test`, zero extra test toolchain |
| `xrpl` | 4.6.0 (Phase 0 spike) |

> The default compiler 0.25.0 targets runtime ABI 0.8.1 and is INCOMPATIBLE with runtime 0.16.0. Must use +0.31.1.

## 5. Verification results
- `node --test` (repo root): **51 tests pass, 0 fail** — covers AccountID encoding, byte utils, hashing golden
  vectors, Merkle, bundle, **cross-language conformance** (circuit==TS==vector), and **§17.1 contract behaviour (13)**.
- `npm run compile` (contract): succeeds → bindings + prover/verifier keys + ZKIR.
- `npm run prove` (contract): **real ZK proof** for `proveEligibility` in **~16.4 s** against proof-server 8.0.3;
  returns a proven `Transaction`. No `--skip-zk`.
- D4 circuit size (ZKIR ops): `proveEligibility` **418**, `setPolicyRoot` **88**.

## 6. Contract address + public test transaction hashes
- No Midnight contract deployed (prove harness proves locally; deploy is a later phase).
- XRPL testnet spike (Phase 0 hardened run) — all validated; full JSON in `docs/PROTOCOL_SPIKE.md`:
  CredentialCreate `AA1D9061…`, Accept `FBBAECE9…`, DepositPreauth `06CEE164…`, Payment-no-cred
  `38AA45D5…` (`tecNO_PERMISSION`), Payment-with-cred `F62B60CC…` (`tesSUCCESS`), Delete `C8E82DBE…`,
  Payment-after-revoke `8EE83A51…` (`tecBAD_CREDENTIALS`).

## 7. Known limitations
- `proveEligibility` is **~16.4 s** to prove (depth-16 persistentHash Merkle fold; D4 custom-Merkle decision — you
  accepted it, revisit only if unacceptable). 16 `persistentHash` + 1 `persistentCommit` + 3 `persistentHash`.
- Real proof is **generated** (proof server) but not yet **submitted/verified on-chain** — deploy is a later phase.
- Mock issuer + all attributes are SYNTHETIC (not KYC). v1 = one credential → one XRPL credential (nullifier).
- Merkle bundle path/root captured at issuance; multi-issue requires re-deriving paths against the final root.

## 8. Files with security-critical logic
- Encoding/commitments (normative = Compact; TS must conform):
  `contracts/private-credential-gateway/src/PrivateCredentialGateway.compact`
  `packages/private-credential-core/src/{account-id,hash,credential,merkle,bundle,bytes}.ts`
- Cross-language oracle: `packages/private-credential-core/test/conformance.test.ts`
- Contract behaviour + witnesses: `contracts/private-credential-gateway/{test/gateway.test.ts,src/witnesses.ts}`
- Real proving: `contracts/private-credential-gateway/scripts/prove-harness.ts` (outside `test/` by design)
- Golden vectors: `packages/private-credential-core/test/vectors/credential.json`

## 9. Deviations from the Mission Profile (with rationale)
1. **D3 correction (you confirmed):** tags are `pad(32,"ascii")` (not sha256) and integers are hashed as native
   `Uint<N>` tuples (not big-endian `Bytes<32>`), matching how Compact actually hashes (proven against the
   compiled `pureCircuits.*`). Two long tags shortened to `cred-leaf:v1` / `adult-ca:v1`.
2. **`request_commitment` is a disclosed OUTPUT, not a public input.** The circuit recomputes it from witnesses and
   `disclose`s it into `approvedRequests` (§8.7 "recomputes and discloses only the request commitment"). The
   gateway recomputes it from (account, nonce, policy, epoch) and checks membership. So Mission §17.1's
   "request commitment mismatch" case is structurally N/A; binding correctness is covered by the happy-path test.
3. **Custom persistentHash Merkle (D4, you accepted)** rather than the stdlib `MerkleTree` ADT — off-chain tree +
   published root; keeps TS/circuit identical by construction; upgrade-stable root.

## Requests for the audit
- Confirm the encoding (D1–D4 as implemented), the disclosure model in `proveEligibility`, the admin-secret auth in
  `setPolicyRoot`, and the witness trust boundary (no `ownPublicKey()`-for-authorization; admin proven via
  `persistentHash(ADMIN, admin_secret) == admin`).
- All decisions are in `docs/PROTOCOL_DECISIONS.md` (D1–D4 + measurements). No merge/deploy before your audit.
