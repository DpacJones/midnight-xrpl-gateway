// FULL end-to-end lifecycle (Mission Profile §16 Phase 4 / §12). Ties every phase together on
// LIVE infrastructure:
//   Midnight devnet: deploy PrivateCredentialGateway, prove eligibility on-chain (real ZK proof)
//   Gateway: verify the receipt (real indexer) + the signed XRPL challenge, issue one CredentialCreate
//   XRPL testnet: accept the credential, prove credential-gated Deposit Authorization, then revoke
//
// Requires the devnet up (:9944/:8088/:6300) and internet (XRPL testnet faucet).
//   npm run e2e   (from apps/e2e-harness)

import { writeFileSync } from "node:fs";
import { Client, Wallet, convertStringToHex } from "xrpl";
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
import { buildChallenge } from "@mxrpl/xrpl-client";
import { createGateway, createXrplCredentialIssuer, InMemoryIdempotencyStore, consoleLogger, type GatewayConfig } from "@mxrpl/gateway";
import { GENESIS_MINT_WALLET_SEED, standaloneConfig } from "./config.ts";
import { buildWallet, ensureDust } from "./wallet.ts";
import { configureProviders } from "./providers.ts";
import { GatewayPrivateStateId, type GatewayPrivateState } from "./contract.ts";
import { deployGateway } from "./app.ts";
import { createGatewayPrivateState } from "../../../contracts/private-credential-gateway/src/witnesses.ts";
import { createMidnightReceiptProvider } from "./midnight-receipt-provider.ts";

setNetworkId("undeployed");

const XRPL_ENDPOINT = "wss://s.altnet.rippletest.net:51233";
const CRED_TYPE_HEX = convertStringToHex("ATL_MIDNIGHT_ELIGIBLE_V1").toUpperCase();
const CUTOFF = 2008n;
const ALLOWED = jurisdictionToUint("CA");
const artifact: Record<string, unknown> = { network: { midnight: "undeployed-standalone", xrpl: "testnet" } };

async function submit(c: Client, w: Wallet, tx: Record<string, unknown>, label: string) {
  const prepared = await c.autofill(tx as never);
  const res = await c.submitAndWait(w.sign(prepared).tx_blob);
  const code = (res.result.meta as { TransactionResult?: string })?.TransactionResult;
  console.log(`  [${label}] ${code}  ${res.result.hash}`);
  return { code, hash: res.result.hash };
}

async function main() {
  const c = new Client(XRPL_ENDPOINT);
  await c.connect();
  try {
    // --- XRPL accounts (faucet) ---
    console.log("funding XRPL testnet accounts...");
    const issuer = (await c.fundWallet()).wallet;
    const user = (await c.fundWallet()).wallet;
    const authorizer = (await c.fundWallet()).wallet;
    artifact.xrpl = { issuer: issuer.classicAddress, user: user.classicAddress, authorizer: authorizer.classicAddress, credentialTypeHex: CRED_TYPE_HEX };
    console.log(`  issuer ${issuer.classicAddress} | user ${user.classicAddress} | authorizer ${authorizer.classicAddress}`);

    // --- Midnight: deploy + prove eligibility on-chain, bound to the user's XRPL account ---
    console.log("midnight: building wallet + deploying contract...");
    const ctx = await buildWallet(standaloneConfig, GENESIS_MINT_WALLET_SEED);
    await ensureDust(ctx.wallet, ctx.unshieldedKeystore);
    const providers = await configureProviders(ctx, standaloneConfig);

    const holderSecret = randomBytes32();
    const credentialId = randomBytes32();
    const issuerRandomness = randomBytes32();
    const adminSecret = randomBytes32();
    const holderKey = deriveHolderKey(holderSecret);
    const leaf = credentialLeaf({ schemaVersion: 1, credentialId, holderKey, birthYear: 2000, jurisdictionCode: "CA", validUntilPolicyEpoch: 1, issuerRandomness });
    const tree = CredentialMerkleTree.from([leaf], 16);
    const path = tree.pathFor(0);

    const deployed = await deployGateway(providers, createGatewayPrivateState(), [hashVec([TAG.ADMIN, adminSecret]), POLICY_ID32, tree.root(), 1n, CUTOFF, ALLOWED]);
    const contractAddress = deployed.deployTxData.public.contractAddress;
    console.log(`  contract deployed: ${contractAddress}`);

    const accountId32 = xrplAddressToBytes32(user.classicAddress);
    const requestNonce = randomBytes32();
    const rc = requestCommitment({ xrplAccountId32: accountId32, requestNonce, policyEpoch: 1 });

    const holderPS: GatewayPrivateState = createGatewayPrivateState({
      holderSecret, credentialId, issuerRandomness, schemaVersion: 1n, birthYear: 2000n, jurisdiction: ALLOWED, validUntil: 1n,
      merkleSiblings: path.entries.map((e) => e.sibling), merkleGoesLeft: path.entries.map((e) => e.goesLeft), xrplAccountId: accountId32, requestNonce,
    });
    await providers.privateStateProvider.set(GatewayPrivateStateId, holderPS);
    console.log("midnight: proving eligibility on-chain (real ZK proof)...");
    const proveRes = await deployed.callTx.proveEligibility();
    console.log(`  proveEligibility landed @ block ${proveRes.public.blockHeight}`);
    artifact.midnight = { contractAddress, proveBlock: proveRes.public.blockHeight, requestCommitment: toHex(rc) };

    // --- XRPL authorizer: enable Deposit Authorization + credential-based preauth ---
    console.log("xrpl: configuring authorizer (deposit auth + credential preauth)...");
    await submit(c, authorizer, { TransactionType: "AccountSet", Account: authorizer.classicAddress, SetFlag: 9 }, "EnableDepositAuth");
    await submit(c, authorizer, { TransactionType: "DepositPreauth", Account: authorizer.classicAddress, AuthorizeCredentials: [{ Credential: { Issuer: issuer.classicAddress, CredentialType: CRED_TYPE_HEX } }] }, "DepositPreauth");

    // --- Gateway: verify receipt + signed challenge, issue ONE CredentialCreate ---
    const config: GatewayConfig = {
      midnight: { network: "undeployed", contractAddress, policyId32Hex: toHex(POLICY_ID32) },
      xrpl: { network: "testnet", endpoint: XRPL_ENDPOINT, credentialIssuer: issuer.classicAddress, credentialTypeHex: CRED_TYPE_HEX },
    };
    const gateway = createGateway(config, {
      midnight: createMidnightReceiptProvider(providers.publicDataProvider, contractAddress),
      issuer: createXrplCredentialIssuer(config, issuer.seed!),
      store: new InMemoryIdempotencyStore(),
      logger: consoleLogger, // structured redacted issuance logs (§18)
    });
    const signedChallengeBlob = user.sign(buildChallenge({ account: user.classicAddress, policyId32: POLICY_ID32, policyEpoch: 1, requestCommitment: rc, requestNonce }) as never).tx_blob;
    console.log("gateway: issuing credential from the confirmed receipt...");
    const issued = await gateway.issueCredential({
      midnightContractAddress: contractAddress,
      midnightTransactionId: String(proveRes.public.blockHeight),
      requestCommitment: toHex(rc),
      policyId: toHex(POLICY_ID32),
      policyEpoch: 1,
      xrplAccount: user.classicAddress,
      requestNonce: toHex(requestNonce),
      signedChallengeBlob,
    });
    console.log(`  gateway issued: ${issued.status}  credentialId=${issued.credentialId}  hash=${issued.createHash}`);
    artifact.credential = { id: issued.credentialId, createHash: issued.createHash };

    // --- XRPL: user accepts, then the credential-gated Deposit Authorization demo ---
    await submit(c, user, { TransactionType: "CredentialAccept", Account: user.classicAddress, Issuer: issuer.classicAddress, CredentialType: CRED_TYPE_HEX }, "CredentialAccept");
    const pay = (creds?: string[]) => ({ TransactionType: "Payment", Account: user.classicAddress, Destination: authorizer.classicAddress, Amount: "1000000", ...(creds ? { CredentialIDs: creds } : {}) });
    const denied = await submit(c, user, pay(), "Payment WITHOUT credential");
    const allowed = await submit(c, user, pay([issued.credentialId]), "Payment WITH credential");
    const del = await submit(c, issuer, { TransactionType: "CredentialDelete", Account: issuer.classicAddress, Subject: user.classicAddress, CredentialType: CRED_TYPE_HEX }, "CredentialDelete");
    const afterRevoke = await submit(c, user, pay([issued.credentialId]), "Payment after revocation");

    artifact.lifecycle = {
      acceptedThenDeniedWithout: denied.code,
      allowedWith: allowed.code,
      delete: del.code,
      deniedAfterRevoke: afterRevoke.code,
      paymentHashes: { denied: denied.hash, allowed: allowed.hash, afterRevoke: afterRevoke.hash, delete: del.hash },
    };

    const gate = denied.code === "tecNO_PERMISSION" && allowed.code === "tesSUCCESS" && del.code === "tesSUCCESS" && afterRevoke.code === "tecBAD_CREDENTIALS";
    artifact.E2E_LIFECYCLE_PROVEN = gate;
    writeFileSync(new URL("../e2e-artifact.json", import.meta.url), JSON.stringify(artifact, null, 2));

    console.log("\n================= E2E GATE =================");
    console.log(`  payment without credential: ${denied.code} (expect tecNO_PERMISSION)`);
    console.log(`  payment with credential:    ${allowed.code} (expect tesSUCCESS)`);
    console.log(`  payment after revocation:   ${afterRevoke.code} (expect tecBAD_CREDENTIALS)`);
    console.log(`  ${gate ? "E2E GREEN — private Midnight eligibility -> gateway -> XRPL-enforced credential, full lifecycle." : "E2E RED"}`);
    console.log("  artifact: apps/e2e-harness/e2e-artifact.json (redacted: addresses/hashes only, no secrets)");
    // Fail the process if any lifecycle code is off — a red gate must NOT exit success.
    if (!gate) throw new Error(`E2E lifecycle gate failed: without=${denied.code} with=${allowed.code} delete=${del.code} afterRevoke=${afterRevoke.code}`);
  } finally {
    if (c.isConnected()) await c.disconnect();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
