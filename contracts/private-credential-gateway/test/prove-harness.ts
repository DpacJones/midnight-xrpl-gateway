// Real ZK proving harness (Phase 2 D4 / exit gate): generates an ACTUAL proof for
// proveEligibility against the proof server (:6300) and measures proving time. No node /
// indexer / wallet — builds the unproven call tx from local states, then proves it.
//
//   node test/prove-harness.ts        (proof server must be running on :6300)

import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import * as Gateway from "../managed/contract/index.js";
import { witnesses, createGatewayPrivateState } from "../src/witnesses.ts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { createUnprovenCallTxFromInitialStates } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { sampleContractAddress, createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import { LedgerParameters, ZswapChainState, sampleCoinPublicKey, sampleEncryptionPublicKey } from "@midnight-ntwrk/ledger-v8";
import {
  deriveHolderKey,
  credentialLeaf,
  jurisdictionToUint,
  CredentialMerkleTree,
  hashVec,
  TAG,
  POLICY_ID32,
  randomBytes32,
} from "@mxrpl/private-credential-core";

setNetworkId("undeployed");

const here = dirname(fileURLToPath(import.meta.url));
const zkConfigPath = resolve(here, "../managed");
const PROOF_SERVER = process.env.PROOF_SERVER ?? "http://127.0.0.1:6300";
const CALLER = "ab".repeat(32);

// --- build a valid synthetic credential + its tree/path ---
const holderSecret = randomBytes32();
const credentialId = randomBytes32();
const issuerRandomness = randomBytes32();
const adminSecret = randomBytes32();
const holderKey = deriveHolderKey(holderSecret);
const leaf = credentialLeaf({
  schemaVersion: 1,
  credentialId,
  holderKey,
  birthYear: 2000,
  jurisdictionCode: "CA",
  validUntilPolicyEpoch: 1,
  issuerRandomness,
});
const tree = CredentialMerkleTree.from([leaf], 16);
const path = tree.pathFor(0);
const account = randomBytes32();
const nonce = randomBytes32();

// --- compiled contract + sampled primitives (no chain) ---
const compiledContract = CompiledContract.make("private-credential-gateway", Gateway.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

const rawContract = new Gateway.Contract(witnesses);
const init = rawContract.initialState(
  createConstructorContext(createGatewayPrivateState(), CALLER),
  hashVec([TAG.ADMIN, adminSecret]),
  POLICY_ID32,
  tree.root(),
  1n,
  2008n,
  jurisdictionToUint("CA"),
);

const privateState = createGatewayPrivateState({
  holderSecret,
  credentialId,
  issuerRandomness,
  schemaVersion: 1n,
  birthYear: 2000n,
  jurisdiction: jurisdictionToUint("CA"),
  validUntil: 1n,
  merkleSiblings: path.entries.map((e) => e.sibling),
  merkleGoesLeft: path.entries.map((e) => e.goesLeft),
  xrplAccountId: account,
  requestNonce: nonce,
});

const zkConfig = new NodeZkConfigProvider(zkConfigPath);
const proofProvider = httpClientProofProvider(PROOF_SERVER, zkConfig);

console.log("building unproven proveEligibility call tx (local states)...");
const unsubmitted: any = await createUnprovenCallTxFromInitialStates(
  zkConfig,
  {
    compiledContract,
    contractAddress: sampleContractAddress(),
    circuitId: "proveEligibility",
    coinPublicKey: sampleCoinPublicKey(),
    initialContractState: init.currentContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
    initialPrivateState: privateState,
  } as any,
  sampleEncryptionPublicKey(),
);

const unprovenTx = unsubmitted.private.unprovenTx;
console.log(`proving against ${PROOF_SERVER} ...`);
const t0 = performance.now();
const proven = await proofProvider.proveTx(unprovenTx);
const ms = performance.now() - t0;

console.log("================ REAL PROOF ================");
console.log(`proveEligibility proving time: ${Math.round(ms)} ms`);
console.log(`proven tx: ${proven?.constructor?.name ?? typeof proven}`);
console.log("===========================================");
