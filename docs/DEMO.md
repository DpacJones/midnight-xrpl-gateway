# Demo / Runbook

Everything here runs on **testnet / a local devnet** with **synthetic** attributes. Commands assume
WSL/Linux, Node 24.x (≥22 for native TS), with `node` + the `compact` CLI on `PATH`.

## 0. Unit + conformance tests (no infra)
```sh
npm ci
node --test          # 80 tests: encoders, hashing golden vectors, Merkle, bundle, challenge
                     #            (adversarial), gateway pipeline (§17.4 + rate-limit + log redaction)
```
The contract conformance + behaviour tests additionally need the compiled bindings — see step 2.

## 1. XRPL credential-enforcement spike (XRPL testnet only)
Proves XRPL natively enforces credential-gated Deposit Authorization — the assumption the whole
design rests on. Funds 3 ephemeral faucet wallets and runs the lifecycle:
```sh
npm run spike        # -> docs/PROTOCOL_SPIKE.md evidence (CredentialCreate/Accept/DepositPreauth,
                     #    payment without cred -> tecNO_PERMISSION, with -> tesSUCCESS, delete -> tecBAD_CREDENTIALS)
```

## 2. Compile the contract + one real ZK proof (needs the proof server :6300)
```sh
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.0.3        # or via the devnet (step 3)
npm run compile -w @mxrpl/private-credential-gateway-contract       # -> managed/ (bindings, keys, ZKIR)
node --test                                                         # now also runs the conformance + §17.1 contract tests
npm run prove   -w @mxrpl/private-credential-gateway-contract       # ONE real proof, ~16-25 s, no --skip-zk
```

## 3. Full end-to-end lifecycle (local Midnight devnet + XRPL testnet)
Bring up the devnet (pinned: node `0.22.3`, indexer-standalone `4.0.0`, proof-server `8.0.3` on
9944 / 8088 / 6300). Via the tooling skill: `/midnight-tooling:devnet generate --node-version 0.22.3
--indexer-version 4.0.0 --proof-server-version 8.0.3` then `docker compose -p midnight-devnet up -d`.
Health: `curl localhost:9944/health`, `curl localhost:6300/health`, and a POST to
`localhost:8088/api/v3/graphql`. Then:
```sh
npm run compile -w @mxrpl/private-credential-gateway-contract   # if not already compiled
npm run e2e     -w @mxrpl/e2e-harness                            # needs internet (XRPL testnet faucet)
```

`run-e2e.ts` performs the complete sequence and **fails the process** if any lifecycle code is off:
1. fund issuer / user / authorizer (XRPL testnet)
2. deploy `PrivateCredentialGateway`; inject holder private state; **`proveEligibility` on-chain (real ZK proof)**
3. authorizer: enable Deposit Authorization + credential-based `DepositPreauth`
4. gateway: verify the real receipt (indexer) + the signed challenge, issue **one** `CredentialCreate`
5. user `CredentialAccept`
6. payment **without** credential → `tecNO_PERMISSION`
7. payment **with** credential → `tesSUCCESS`
8. `CredentialDelete`
9. payment **after revocation** → `tecBAD_CREDENTIALS`

It writes a **redacted** artifact to `apps/e2e-harness/e2e-artifact.json` (addresses + tx hashes +
contract address + request commitment — **no secrets**; gitignored) and prints structured gateway logs.

### Example verified run
Contract `2d97135e…`, real on-chain `proveEligibility` @ block 270, gateway-issued credential
`55E4939D…`; lifecycle `tecNO_PERMISSION` → `tesSUCCESS` → `tecBAD_CREDENTIALS`. `E2E_LIFECYCLE_PROVEN: true`.

## Notes / gotchas
- The `compact` dev-tool default compiler may be old (0.25 → runtime ABI 0.8.1, **incompatible**). Always
  compile with `+0.31.1` (runtime 0.16.0). See `docs/PROTOCOL_DECISIONS.md`.
- The WSL `node_modules` carries Linux-native addons — install on the running platform; don't copy it.
- The genesis devnet wallet seed (`0x…01`) is standalone-only and has no value on any network.
