// One-time setup: fund an XRPL testnet issuer + write the gateway-service .env for Preprod Midnight +
// XRPL testnet, pointed at the live deployed contract. .env is gitignored (the issuer seed is secret).
import { Client, convertStringToHex } from "xrpl";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const client = new Client("wss://s.altnet.rippletest.net:51233");
await client.connect();
const { wallet } = await client.fundWallet();
await client.disconnect();

const env = `# Gateway service — Preprod Midnight + XRPL testnet (generated). GITIGNORED. Issuer seed is a SECRET.
PORT=8787
MXRPL_MIDNIGHT_NETWORK=preprod
MXRPL_NETWORK_ID=preprod
MXRPL_CONTRACT_ADDRESS=3d44f5ec0096386b9d3a8936e3893159d472c0b0d656e2f8efd3555302165636
MXRPL_POLICY_ID=61746c616e7469733a6d7872706c3a6164756c742d63613a7631000000000000
MXRPL_INDEXER_URI=https://indexer.preprod.midnight.network/api/v4/graphql
MXRPL_INDEXER_WS_URI=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
MXRPL_XRPL_ENDPOINT=wss://s.altnet.rippletest.net:51233
MXRPL_CREDENTIAL_ISSUER=${wallet.classicAddress}
MXRPL_CREDENTIAL_TYPE_HEX=${convertStringToHex("ATL_MIDNIGHT_ELIGIBLE_V1").toUpperCase()}
MXRPL_ISSUER_SEED=${wallet.seed}
MXRPL_IDEMPOTENCY_FILE=./gateway-idempotency.json
`;
writeFileSync(resolve(here, "../.env"), env);
console.log("funded + wrote .env — XRPL issuer:", wallet.classicAddress);
