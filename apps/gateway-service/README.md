# @mxrpl/gateway-service

The scoped credential gateway as an **always-on HTTP backend**. It wraps the audited `createGateway`
pipeline so an interactive dApp can request credential issuance — the **XRPL issuer seed lives here,
never in the browser** (that's the whole reason this is a backend).

## Why a backend (and not in the dApp)
The browser does the private proving (1AM, in-wallet) + the Midnight submit + the user's own XRPL
actions. But the `CredentialCreate` must be signed by the **issuer's** key — a secret. So issuance is
the one piece that has to run server-side. See `../../docs/SPIKE_BROWSER_PROVING.md`.

## Endpoints
| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/health` | — | `{ ok, contract, issuer }` |
| `POST` | `/issue-credential` | a `CredentialIssueRequest` (JSON) | the `IssueRecord` (`200`) or `{ error, message }` |

Error status: `400` validation/allowlist/challenge/commitment · `403` `receipt:missing` (no confirmed
Midnight receipt) · `429` rate-limited · `500` internal. The request body is **untrusted** — the
gateway re-validates every field, verifies the signed XRPL challenge, recomputes the commitment, and
confirms the on-chain receipt before issuing.

## Defence layers
1. **Pre-auth IP rate limit** (transport) — sheds floods by caller IP before any work.
2. The gateway's **fail-closed pipeline** — validation → allowlist → real challenge signature →
   **post-auth** per-subject rate limit → receipt check → idempotent single issue.
3. **Hard mainnet guard** — the process refuses to start if pointed at XRPL mainnet.
4. **Structured redacted logs** — never the signed blob or the request nonce.
5. **Body size cap** (16 KB) — issuance requests are tiny.

## Run
```sh
cp .env.example .env          # fill in contract/policy/issuer/seed/indexer (see comments)
npm start -w @mxrpl/gateway-service          # = tsx src/server.ts (loads MXRPL_* from the env)
# or: tsx --env-file=.env src/server.ts
```
Needs the deployed contract reachable via the configured indexer, and a funded issuer account on
XRPL **testnet**. The issuer seed must match `MXRPL_CREDENTIAL_ISSUER`.

## Security notes (before anything real)
- `MXRPL_ISSUER_SEED` is a hot signing key. v1 reads it from env; **use KMS/HSM in production**, and
  consider a regular-key/multisign on the issuer XRPL account for defence in depth.
- The `FileIdempotencyStore` + the in-process rate limiters are **single-process**. A multi-process
  deployment needs a shared store + limiter (DB / Redis). See `KNOWN_LIMITATIONS.md`.
- Set `MXRPL_TRUST_PROXY=true` only behind a trusted reverse proxy (otherwise `X-Forwarded-For` is
  spoofable and would let a caller evade the IP limit).
