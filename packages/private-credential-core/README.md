# @mxrpl/private-credential-core

The reusable, off-circuit half of the Midnight↔XRPL credential gateway (Mission Profile §13 — the future
ProofPass core). Pure TypeScript, runs in Node and the browser. Every primitive here has a Compact circuit
counterpart (Phase 2) that must reproduce its `Bytes<32>` output — the vectors in `test/vectors/` are that
cross-language contract.

Built on `@midnight-ntwrk/compact-runtime@0.16.0` so `persistentHash`/`persistentCommit` match the circuit by
construction. See `../../docs/PROTOCOL_DECISIONS.md` for the governing rulings (D1–D4).

## Surface

| Module | Exports |
|---|---|
| `constants.ts` | `DOMAIN`, `DOMAIN_TAG32_HEX`, `POLICY_ID32_HEX`, `BYTE_LENGTHS`, `POLICY_V1`, `MERKLE_DEPTH` |
| `bytes.ts` | `toHex`, `fromHex`, `uintToBytes32` (big-endian), `randomBytes32`, `assertLen` |
| `account-id.ts` | `xrplAddressToBytes32`, `bytes32ToXrplAddress` — ruling **D2** (left-pad 20→32) |
| `hash.ts` | `hashVec`, `commitVec`, `TAG32`, `POLICY_ID32` — wrap persistentHash/persistentCommit |
| `credential.ts` | `deriveHolderKey`, `credentialLeaf` (**D1** persistentCommit), `requestCommitment`, `nullifier`, `jurisdictionToUint` |
| `merkle.ts` | `CredentialMerkleTree`, `merklePathRoot`, `verifyMerklePath`, path (de)serialization — ruling **D4** |
| `bundle.ts` | `issueCredential`, `verifyCredentialBundle`, `privateCredentialFromBundle`, `CredentialBundle` |

## Commands

```sh
node --test                                              # 34 tests (run from repo root or here)
node scripts/gen-vectors.ts                              # regenerate golden cross-language vectors
node scripts/issue-demo-credential.ts --out-dir demo-out # mock issuer (SYNTHETIC data only)
```

## Privacy notes

- The holder secret never leaves the user; the issuer only ever sees `holder_key`. The bundle carries no secret.
- The mock issuer writes secrets/bundles to files the user holds; stdout logs only public data (root, leaf, epoch).
- All attributes here are **synthetic demo data**, not real KYC.
