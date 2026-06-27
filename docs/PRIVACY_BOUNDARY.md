# Privacy Boundary

**The product protects the *evidence* and the *underlying attributes* — not the fact that a specific
XRPL account received a specific authorization.** Be honest about this in any UI.

## Private to the user (never goes on-chain, never seen by the gateway)
- `holder_secret`, credential salt / `issuer_randomness`
- `birth_year` (the age attribute) and `jurisdiction_code`
- `credential_id`, the Merkle path bundle
- the request `nonce`, until it is submitted to the gateway

Only `holder_key = H(HOLDER, holder_secret)` is ever shared with the issuer. **These witnesses are fed
to the *prover* during proof generation — so with a *hosted* prover they are not device-local; see
"Where proving happens" below.**

## Public on Midnight (ledger / indexer)
- contract address, policy id, current credential root, policy/root version
- used **nullifiers** (opaque), approved **request commitments** (opaque)
- transaction timing + fee metadata

The Midnight contract **does not know**: the XRPL classic address text, the date of birth, the raw
jurisdiction input, the holder secret, or any identity document. The eligibility proof discloses
**only** the nullifier and the request commitment — both opaque 32-byte values.

## Public on XRPL (ledger)
- credential issuer account, **subject XRPL account**, credential type, expiration, acceptance status
- the credential ledger-entry id, and the credential-gated payment

## Visible to the gateway
- the XRPL account, the request nonce, the request commitment, the signed challenge, and where to read
  the Midnight receipt. **The gateway never receives the private credential or its attributes.**

## Why XRPL can't verify the Midnight proof (and what we do instead)
A public XRP Ledger has no Midnight ZK verifier, and there is **no in-process verifier** to inline.
So XRPL cannot check the proof directly. Instead: Midnight verifies the proof on *its* ledger and
records an opaque receipt; the **trusted** gateway observes that receipt and issues a native XRPL
credential; **XRPL natively enforces the credential** via Deposit Authorization + `Payment.CredentialIDs`.
The privacy win is real (attributes never touch XRPL); the trust cost is explicit (the gateway).

## Where proving happens — who sees the witnesses
ZK proving needs the private witnesses as input, so **whoever runs the prover sees them** (the *ledger*
never does — only the proof goes on-chain). Where the prover runs is a wallet/deployment choice:
- **Local proof server** (Lace → Settings » Midnight » Local `http://localhost:6300`, or your own
  `midnightntwrk/proof-server`): witnesses **stay on the user's machine**. Strongest privacy.
- **Hosted prover** (e.g. **1AM on Preview** → `getConfiguration().proverServerUri =
  https://api-preview.1am.xyz`): convenient (nothing to run), but the **prover operator sees the
  witnesses** during proof generation. They still never go on-chain.

This reference dApp connects via 1AM (hosted prover) for testnet convenience with **synthetic** data.
A production privacy posture should prove against a **local** proof server.

## The deliberate cross-chain link (disclose this)
The `CredentialCreate` carries a memo = the **request commitment**, creating public, auditable
cross-network linkage between the XRPL credential and the opaque Midnight receipt. Combined with
transaction timing, an observer can associate the public XRPL credential with the Midnight request —
but **not** the private attributes behind it. A UI must state this; it must **not** claim anonymity.

## Language to use / avoid
**Use:** "Midnight verified the private policy." · "The gateway is a trusted XRPL credential issuer."
· "XRPL does not verify the Midnight proof directly." · "Your private attributes never go on-chain and
are never seen by the gateway; your XRPL credential and account are public."

**Avoid:** "trustless bridge" · "anonymous KYC" · "zero knowledge on XRPL" · "your data never leaves
your device" (only true with a *local* proof server — false with a hosted prover like 1AM's).
