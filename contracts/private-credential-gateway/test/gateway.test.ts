// §17.1 contract behaviour tests — in-process circuit execution (no ZK proof needed to test
// LOGIC; real proving + measurements are a separate step). Each rejection asserts the exact
// Compact assert fires. Requires the contract compiled (skips gracefully otherwise).
//
// This suite also cross-validates the Merkle node hashing: proveEligibility folds the witness
// path with the circuit's persistentHash and asserts it equals the TS-built tree root.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  deriveHolderKey,
  credentialLeaf,
  requestCommitment,
  nullifier,
  jurisdictionToUint,
  CredentialMerkleTree,
  hashVec,
  TAG,
  POLICY_ID32,
  randomBytes32,
  toHex,
  type MerklePath,
} from "../../../packages/private-credential-core/src/index.ts";
import { witnesses, createGatewayPrivateState, type GatewayPrivateState } from "../src/witnesses.ts";

const bindingsUrl = new URL("../managed/contract/index.js", import.meta.url);

if (!existsSync(fileURLToPath(bindingsUrl))) {
  test("gateway behaviour (SKIPPED — contract not compiled; run `npm run compile`)", { skip: true }, () => {});
} else {
  const { Contract, ledger } = (await import(bindingsUrl.href)) as any;
  const { sampleContractAddress, createConstructorContext, createCircuitContext } = (await import("@midnight-ntwrk/compact-runtime")) as any;

  const CALLER = "ab".repeat(32); // dummy coin public key (contract logic does not use ownPublicKey)
  const CUTOFF = 2008n;
  const ALLOWED = jurisdictionToUint("CA");
  const ADMIN_SECRET = randomBytes32();

  type Cred = {
    holderSecret: Uint8Array;
    credentialId: Uint8Array;
    issuerRandomness: Uint8Array;
    schemaVersion: number;
    birthYear: number;
    jurisdictionCode: string;
    validUntilPolicyEpoch: number;
  };

  const mkCred = (over: Partial<Cred> = {}): Cred => ({
    holderSecret: randomBytes32(),
    credentialId: randomBytes32(),
    issuerRandomness: randomBytes32(),
    schemaVersion: 1,
    birthYear: 2000,
    jurisdictionCode: "CA",
    validUntilPolicyEpoch: 1,
    ...over,
  });

  const leafOf = (c: Cred): Uint8Array =>
    credentialLeaf({
      schemaVersion: c.schemaVersion,
      credentialId: c.credentialId,
      holderKey: deriveHolderKey(c.holderSecret),
      birthYear: c.birthYear,
      jurisdictionCode: c.jurisdictionCode,
      validUntilPolicyEpoch: c.validUntilPolicyEpoch,
      issuerRandomness: c.issuerRandomness,
    });

  function makeSim(creds: Cred[], opts: { epoch?: bigint; cutoff?: bigint; allowed?: bigint; adminSecret?: Uint8Array } = {}) {
    const tree = CredentialMerkleTree.from(creds.map(leafOf), 16);
    const contract = new Contract(witnesses);
    const address = sampleContractAddress();
    const adminKey = hashVec([TAG.ADMIN, opts.adminSecret ?? ADMIN_SECRET]);
    const init = contract.initialState(
      createConstructorContext(createGatewayPrivateState(), CALLER),
      adminKey,
      POLICY_ID32,
      tree.root(),
      opts.epoch ?? 1n,
      opts.cutoff ?? CUTOFF,
      opts.allowed ?? ALLOWED,
    );
    let ctx = createCircuitContext(address, CALLER, init.currentContractState, init.currentPrivateState);

    const setState = (ps: Partial<GatewayPrivateState>) => {
      ctx = createCircuitContext(address, CALLER, ctx.currentQueryContext.state, createGatewayPrivateState(ps));
    };
    const stateFor = (c: Cred, account: Uint8Array, nonce: Uint8Array, path: MerklePath): Partial<GatewayPrivateState> => ({
      holderSecret: c.holderSecret,
      credentialId: c.credentialId,
      issuerRandomness: c.issuerRandomness,
      schemaVersion: BigInt(c.schemaVersion),
      birthYear: BigInt(c.birthYear),
      jurisdiction: jurisdictionToUint(c.jurisdictionCode),
      validUntil: BigInt(c.validUntilPolicyEpoch),
      merkleSiblings: path.entries.map((e) => e.sibling),
      merkleGoesLeft: path.entries.map((e) => e.goesLeft),
      xrplAccountId: account,
      requestNonce: nonce,
    });

    return {
      tree,
      getLedger: () => ledger(ctx.currentQueryContext.state),
      prove: (c: Cred, account: Uint8Array, nonce: Uint8Array, pathOverride?: MerklePath) => {
        const path = pathOverride ?? tree.pathFor(creds.indexOf(c));
        setState(stateFor(c, account, nonce, path));
        ctx = contract.impureCircuits.proveEligibility(ctx).context;
      },
      setRoot: (adminSecret: Uint8Array, newRoot: Uint8Array, newEpoch: bigint) => {
        setState({ adminSecret });
        ctx = contract.impureCircuits.setPolicyRoot(ctx, newRoot, newEpoch).context;
      },
    };
  }

  // ---- proveEligibility: happy path + effects ----
  test("valid credential + policy succeeds and records nullifier + request commitment", () => {
    const c = mkCred();
    const sim = makeSim([c]);
    const account = randomBytes32();
    const nonce = randomBytes32();
    sim.prove(c, account, nonce);
    const led = sim.getLedger();
    const rc = requestCommitment({ xrplAccountId32: account, requestNonce: nonce, policyEpoch: 1 });
    const nul = nullifier({ holderSecret: c.holderSecret, credentialId: c.credentialId });
    assert.ok(led.approvedRequests.member(rc), "request commitment recorded");
    assert.ok(led.usedNullifiers.member(nul), "nullifier recorded");
    assert.equal(led.approvedRequests.size(), 1n);
  });

  // ---- Merkle / membership ----
  test("invalid Merkle path fails", () => {
    const c = mkCred();
    const sim = makeSim([c]);
    const bad = sim.tree.pathFor(0);
    const tampered: MerklePath = { ...bad, entries: bad.entries.map((e, i) => (i === 0 ? { ...e, sibling: new Uint8Array(32).fill(0xee) } : e)) };
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32(), tampered), /merkle/i);
  });

  test("wrong holder secret fails (recomputed leaf not in the tree)", () => {
    const c = mkCred();
    const sim = makeSim([c]);
    const wrong: Cred = { ...c, holderSecret: randomBytes32() };
    // supply the real leaf's path but the wrong witness secret -> recomputed root mismatches
    assert.throws(() => sim.prove(wrong, randomBytes32(), randomBytes32(), sim.tree.pathFor(0)), /merkle/i);
  });

  // ---- policy predicates (leaf IS in the tree; the policy assert fires) ----
  test("underage credential fails", () => {
    const c = mkCred({ birthYear: 2010 });
    const sim = makeSim([c]);
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /underage/i);
  });

  test("wrong jurisdiction fails", () => {
    const c = mkCred({ jurisdictionCode: "US" });
    const sim = makeSim([c]);
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /jurisdiction/i);
  });

  test("expired credential (valid_until < epoch) fails", () => {
    const c = mkCred({ validUntilPolicyEpoch: 0 });
    const sim = makeSim([c], { epoch: 1n });
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /expired/i);
  });

  test("non-v1 schema version fails (root purity is not a hidden assumption)", () => {
    const c = mkCred({ schemaVersion: 2 }); // leaf with schema 2 IS in the tree -> membership passes
    const sim = makeSim([c]);
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /schema/i);
  });

  // ---- nullifier / account binding ----
  test("same nullifier cannot be used twice", () => {
    const c = mkCred();
    const sim = makeSim([c]);
    sim.prove(c, randomBytes32(), randomBytes32());
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /nullifier/i);
  });

  test("same credential cannot authorize a second XRPL account", () => {
    const c = mkCred();
    const sim = makeSim([c]);
    sim.prove(c, randomBytes32(), randomBytes32());
    // different account, same credential -> same nullifier -> rejected
    assert.throws(() => sim.prove(c, randomBytes32(), randomBytes32()), /nullifier/i);
  });

  test("separate valid credential can authorize another account", () => {
    const a = mkCred();
    const b = mkCred();
    const sim = makeSim([a, b]);
    sim.prove(a, randomBytes32(), randomBytes32());
    sim.prove(b, randomBytes32(), randomBytes32());
    assert.equal(sim.getLedger().approvedRequests.size(), 2n);
  });

  // ---- setPolicyRoot (admin) ----
  test("admin can rotate the root and bump the epoch", () => {
    const sim = makeSim([mkCred()]);
    const newRoot = CredentialMerkleTree.from([leafOf(mkCred())], 16).root();
    sim.setRoot(ADMIN_SECRET, newRoot, 2n);
    const led = sim.getLedger();
    assert.equal(toHex(led.credentialRoot), toHex(newRoot));
    assert.equal(led.policyEpoch, 2n);
  });

  test("non-admin cannot rotate the root", () => {
    const sim = makeSim([mkCred()]);
    const newRoot = CredentialMerkleTree.from([leafOf(mkCred())], 16).root();
    assert.throws(() => sim.setRoot(randomBytes32(), newRoot, 2n), /admin/i);
  });

  test("epoch cannot decrease or repeat", () => {
    const sim = makeSim([mkCred()], { epoch: 1n });
    const newRoot = CredentialMerkleTree.from([leafOf(mkCred())], 16).root();
    assert.throws(() => sim.setRoot(ADMIN_SECRET, newRoot, 1n), /epoch/i);
  });

  test("root cannot be set to zero", () => {
    const sim = makeSim([mkCred()]);
    assert.throws(() => sim.setRoot(ADMIN_SECRET, new Uint8Array(32), 2n), /zero/i);
  });
}
