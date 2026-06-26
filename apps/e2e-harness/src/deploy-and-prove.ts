// Milestone: deploy PrivateCredentialGateway to the local Midnight devnet, run a REAL on-chain
// proveEligibility (real ZK proof, verified by the ledger), and read back approvedRequests — the
// exact state the gateway's MidnightReceiptProvider queries. Requires the devnet up (:9944/:8088/:6300).
//   npm run deploy   (from apps/e2e-harness)

import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import {
  deriveHolderKey,
  credentialLeaf,
  requestCommitment,
  jurisdictionToUint,
  CredentialMerkleTree,
  hashVec,
  TAG,
  POLICY_ID32,
  randomBytes32,
  toHex,
  xrplAddressToBytes32,
} from "@mxrpl/private-credential-core";
import { Wallet } from "xrpl";
import { GENESIS_MINT_WALLET_SEED, standaloneConfig } from "./config.ts";
import { buildWallet, ensureDust } from "./wallet.ts";
import { configureProviders } from "./providers.ts";
import { ledgerOf, GatewayPrivateStateId, type GatewayPrivateState } from "./contract.ts";
import { deployGateway } from "./app.ts";
import { createGatewayPrivateState } from "../../../contracts/private-credential-gateway/src/witnesses.ts";

setNetworkId("undeployed");

const CUTOFF = 2008n;
const ALLOWED = jurisdictionToUint("CA");

async function main() {
  // --- wallet + providers (genesis-funded) ---
  const ctx = await buildWallet(standaloneConfig, GENESIS_MINT_WALLET_SEED);
  await ensureDust(ctx.wallet, ctx.unshieldedKeystore);
  const providers = await configureProviders(ctx, standaloneConfig);
  console.log("wallet + providers ready");

  // --- build a synthetic credential + its single-leaf tree ---
  const holderSecret = randomBytes32();
  const credentialId = randomBytes32();
  const issuerRandomness = randomBytes32();
  const adminSecret = randomBytes32();
  const holderKey = deriveHolderKey(holderSecret);
  const leaf = credentialLeaf({ schemaVersion: 1, credentialId, holderKey, birthYear: 2000, jurisdictionCode: "CA", validUntilPolicyEpoch: 1, issuerRandomness });
  const tree = CredentialMerkleTree.from([leaf], 16);
  const path = tree.pathFor(0);
  const adminKey = hashVec([TAG.ADMIN, adminSecret]);

  // --- deploy with constructor args ---
  const deployed = await deployGateway(providers, createGatewayPrivateState(), [adminKey, POLICY_ID32, tree.root(), 1n, CUTOFF, ALLOWED]);
  const address = deployed.deployTxData.public.contractAddress;
  console.log(`contract deployed: ${address}`);

  // --- the holder's XRPL account + nonce + the request commitment we expect on-chain ---
  const xrplWallet = Wallet.generate();
  const accountId32 = xrplAddressToBytes32(xrplWallet.classicAddress);
  const requestNonce = randomBytes32();
  const rc = requestCommitment({ xrplAccountId32: accountId32, requestNonce, policyEpoch: 1 });
  console.log(`expected request commitment: ${toHex(rc)}`);

  // --- set the holder's private state, then run proveEligibility on-chain (real proof) ---
  const holderPS: GatewayPrivateState = createGatewayPrivateState({
    holderSecret,
    credentialId,
    issuerRandomness,
    schemaVersion: 1n,
    birthYear: 2000n,
    jurisdiction: ALLOWED,
    validUntil: 1n,
    merkleSiblings: path.entries.map((e) => e.sibling),
    merkleGoesLeft: path.entries.map((e) => e.goesLeft),
    xrplAccountId: accountId32,
    requestNonce,
  });
  await providers.privateStateProvider.set(GatewayPrivateStateId, holderPS);

  console.log("proving eligibility on-chain (real ZK proof)...");
  const proveRes = await deployed.callTx.proveEligibility();
  console.log(`proveEligibility landed @ block ${proveRes.public.blockHeight} — real proof verified on-chain`);

  // --- read approvedRequests from the indexer (what MidnightReceiptProvider checks) ---
  const st = await providers.publicDataProvider.queryContractState(address);
  if (!st) throw new Error("contract state not found via indexer");
  const led = ledgerOf((st as { data?: unknown }).data ?? st);
  const present = led.approvedRequests.member(rc);
  console.log(`indexer read: approvedRequests.member(requestCommitment) = ${present} (expected true)`);
  if (!present) throw new Error("request commitment NOT found in approvedRequests");

  console.log("");
  console.log("DEPLOY+PROVE OK — PrivateCredentialGateway deployed, real on-chain proveEligibility,");
  console.log(`                  request commitment recorded in approvedRequests at ${address}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("DEPLOY+PROVE FAILED:", e);
  process.exit(1);
});
