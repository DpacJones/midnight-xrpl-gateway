// Verify the gateway-service's Midnight-read side against the LIVE deployed contract on Preprod:
// reads the contract state via the indexer + decodes the policy (proves the receipt provider can see it).
//   MXRPL_INDEXER_URI=… MXRPL_CONTRACT_ADDRESS=… npx tsx scripts/check-contract.ts
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { toHex } from "@mxrpl/private-credential-core";
import { ledger as ledgerOf } from "../../../contracts/private-credential-gateway/managed/contract/index.js";

const NETWORK = process.env.MXRPL_NETWORK_ID ?? "preprod";
const INDEXER = process.env.MXRPL_INDEXER_URI ?? "https://indexer.preprod.midnight.network/api/v4/graphql";
const INDEXER_WS = process.env.MXRPL_INDEXER_WS_URI ?? "wss://indexer.preprod.midnight.network/api/v4/graphql/ws";
const CONTRACT = process.env.MXRPL_CONTRACT_ADDRESS ?? "3d44f5ec0096386b9d3a8936e3893159d472c0b0d656e2f8efd3555302165636";

setNetworkId(NETWORK as never);
console.log(`reading ${CONTRACT} via ${INDEXER} (network ${NETWORK})…`);
const pdp = indexerPublicDataProvider(INDEXER, INDEXER_WS);
const st = await pdp.queryContractState(CONTRACT);
if (!st) {
  console.error("✗ contract state NOT found via indexer");
  process.exit(1);
}
const led = ledgerOf((st as { data?: unknown }).data ?? st) as Record<string, unknown>;
const hx = (v: unknown) => (v instanceof Uint8Array ? toHex(v) : String(v));
console.log("✓ contract read OK:");
console.log("  policyId        :", hx(led.policyId));
console.log("  credentialRoot  :", hx(led.credentialRoot));
console.log("  policyEpoch     :", String(led.policyEpoch));
console.log("  adultCutoffYear :", String(led.adultCutoffYear));
console.log("  allowedJur      :", String(led.allowedJurisdiction));
process.exit(0);
