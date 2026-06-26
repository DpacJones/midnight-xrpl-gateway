import test from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "xrpl";
import { POLICY_ID32, requestCommitment, xrplAddressToBytes32, toHex, fromHex, randomBytes32 } from "@mxrpl/private-credential-core";
import { buildChallenge } from "@mxrpl/xrpl-client";
import {
  createGateway,
  buildCredentialCreate,
  assertSafeConfig,
  InMemoryIdempotencyStore,
  GatewayError,
  type GatewayConfig,
  type CredentialIssueRequest,
  type MidnightReceiptProvider,
  type XrplCredentialIssuer,
} from "../src/index.ts";

const POLICY_HEX = toHex(POLICY_ID32);
const CONTRACT = "0200" + "ab".repeat(31); // opaque configured contract address
const ISSUER = "rIssuerXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const CRED_TYPE_HEX = "41544C5F4D49444E494748545F454C494749424C455F5631"; // ATL_MIDNIGHT_ELIGIBLE_V1

function config(over: Partial<GatewayConfig["xrpl"]> = {}): GatewayConfig {
  return {
    midnight: { network: "undeployed", contractAddress: CONTRACT, policyId32Hex: POLICY_HEX },
    xrpl: { network: "testnet", endpoint: "wss://s.altnet.rippletest.net:51233", credentialIssuer: ISSUER, credentialTypeHex: CRED_TYPE_HEX, ...over },
  };
}

// --- mocks ---
function mockMidnight(approved: Set<string>): MidnightReceiptProvider {
  return { isApprovedRequest: async ({ requestCommitmentHex }) => approved.has(requestCommitmentHex) };
}
function mockIssuer(opts: { existing?: string; fail?: boolean; delayMs?: number } = {}) {
  const calls = { issue: 0, existing: 0 };
  const issuer: XrplCredentialIssuer = {
    existingCredentialId: async () => {
      calls.existing++;
      return opts.existing;
    },
    issueCredential: async () => {
      calls.issue++;
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw new Error("xrpl submit failed");
      return { hash: "TXHASH", credentialId: "CREDID" };
    },
  };
  return { issuer, calls };
}

// Build a fully-consistent valid request (wallet signs the canonical challenge).
function validRequest(epoch = 1): { req: CredentialIssueRequest; commitmentHex: string } {
  const w = Wallet.generate();
  const nonce = randomBytes32();
  const accountId32 = xrplAddressToBytes32(w.classicAddress);
  const rc = requestCommitment({ xrplAccountId32: accountId32, requestNonce: nonce, policyEpoch: epoch, policyId32: POLICY_ID32 });
  const blob = w.sign(buildChallenge({ account: w.classicAddress, policyId32: POLICY_ID32, policyEpoch: epoch, requestCommitment: rc, requestNonce: nonce }) as never).tx_blob;
  return {
    commitmentHex: toHex(rc),
    req: {
      midnightContractAddress: CONTRACT,
      midnightTransactionId: "MIDTX1",
      requestCommitment: toHex(rc),
      policyId: POLICY_HEX,
      policyEpoch: epoch,
      xrplAccount: w.classicAddress,
      requestNonce: toHex(nonce),
      signedChallengeBlob: blob,
    },
  };
}

function gw(over: { approved?: Set<string>; issuer?: ReturnType<typeof mockIssuer>; store?: InMemoryIdempotencyStore; cfg?: GatewayConfig } = {}) {
  const issuer = over.issuer ?? mockIssuer();
  const store = over.store ?? new InMemoryIdempotencyStore();
  const g = createGateway(over.cfg ?? config(), { midnight: mockMidnight(over.approved ?? new Set()), issuer: issuer.issuer, store });
  return { g, issuer, store };
}

test("happy path: issues exactly one fixed credential and persists the result", async () => {
  const { req, commitmentHex } = validRequest();
  const { g, issuer, store } = gw({ approved: new Set([commitmentHex]) });
  const res = await g.issueCredential(req);
  assert.equal(res.status, "issued");
  assert.equal(res.credentialId, "CREDID");
  assert.equal(res.createHash, "TXHASH");
  assert.equal(issuer.calls.issue, 1);
  // validated result persisted
  const key = `testnet:${POLICY_HEX}:${commitmentHex}`;
  assert.ok(await store.get(key));
});

test("missing Midnight receipt fails", async () => {
  const { req } = validRequest();
  const { g } = gw({ approved: new Set() }); // not approved
  await assert.rejects(() => g.issueCredential(req), (e) => e instanceof GatewayError && e.code === "receipt:missing");
});

test("receipt from wrong contract fails (allowlist)", async () => {
  const { req, commitmentHex } = validRequest();
  const { g } = gw({ approved: new Set([commitmentHex]) });
  await assert.rejects(() => g.issueCredential({ ...req, midnightContractAddress: "0200" + "ff".repeat(31) }), (e) => e instanceof GatewayError && e.code === "allowlist:contract");
});

test("wrong policy fails (allowlist)", async () => {
  const { req, commitmentHex } = validRequest();
  const { g } = gw({ approved: new Set([commitmentHex]) });
  await assert.rejects(() => g.issueCredential({ ...req, policyId: toHex(randomBytes32()) }), (e) => e instanceof GatewayError && e.code === "allowlist:policy");
});

test("wrong epoch fails (challenge no longer matches)", async () => {
  const { req, commitmentHex } = validRequest(1);
  const { g } = gw({ approved: new Set([commitmentHex]) });
  await assert.rejects(() => g.issueCredential({ ...req, policyEpoch: 2 }), (e) => e instanceof GatewayError);
});

test("commitment mismatch fails", async () => {
  const { req, commitmentHex } = validRequest();
  const { g } = gw({ approved: new Set([commitmentHex, toHex(randomBytes32())]) });
  await assert.rejects(() => g.issueCredential({ ...req, requestCommitment: toHex(randomBytes32()) }), (e) => e instanceof GatewayError);
});

test("duplicate request is idempotent (issues once)", async () => {
  const { req, commitmentHex } = validRequest();
  const { g, issuer } = gw({ approved: new Set([commitmentHex]) });
  const a = await g.issueCredential(req);
  const b = await g.issueCredential(req);
  assert.equal(a.status, "issued");
  assert.equal(b.status, "idempotent");
  assert.equal(b.credentialId, "CREDID");
  assert.equal(issuer.calls.issue, 1); // not re-issued
});

test("concurrent duplicate requests issue only once (per-key critical section)", async () => {
  const { req, commitmentHex } = validRequest();
  const issuer = mockIssuer({ delayMs: 50 }); // first issue is still in-flight when the second starts
  const { g } = gw({ approved: new Set([commitmentHex]), issuer });
  const [a, b] = await Promise.all([g.issueCredential(req), g.issueCredential(req)]);
  assert.equal(issuer.calls.issue, 1); // only ONE submit despite the race
  assert.deepEqual([a.status, b.status].sort(), ["idempotent", "issued"]);
  assert.equal(a.credentialId, "CREDID");
  assert.equal(b.credentialId, "CREDID");
});

test("existing XRPL credential is handled deterministically (no second issue)", async () => {
  const { req, commitmentHex } = validRequest();
  const issuer = mockIssuer({ existing: "EXISTING_CRED" });
  const { g } = gw({ approved: new Set([commitmentHex]), issuer });
  const res = await g.issueCredential(req);
  assert.equal(res.status, "exists");
  assert.equal(res.credentialId, "EXISTING_CRED");
  assert.equal(issuer.calls.issue, 0);
});

test("XRPL submission failure does not mark the request complete (retry can proceed)", async () => {
  const { req, commitmentHex } = validRequest();
  const store = new InMemoryIdempotencyStore();
  const failing = mockIssuer({ fail: true });
  const g1 = createGateway(config(), { midnight: mockMidnight(new Set([commitmentHex])), issuer: failing.issuer, store });
  await assert.rejects(() => g1.issueCredential(req)); // submit fails
  const key = `testnet:${POLICY_HEX}:${commitmentHex}`;
  assert.equal(await store.get(key), undefined); // NOT persisted
  // retry with a working issuer succeeds
  const ok = mockIssuer();
  const g2 = createGateway(config(), { midnight: mockMidnight(new Set([commitmentHex])), issuer: ok.issuer, store });
  const res = await g2.issueCredential(req);
  assert.equal(res.status, "issued");
});

test("gateway cannot be induced to sign another transaction type (fixed CredentialCreate)", () => {
  const tx = buildCredentialCreate(config(), "rSubjectXXXXXXXXXXXXXXXXXXXXXXXXXXX", "ab".repeat(32));
  assert.equal(tx.TransactionType, "CredentialCreate");
  assert.equal(tx.Account, ISSUER);
  assert.equal(tx.CredentialType, CRED_TYPE_HEX);
  // only the fixed field set — no arbitrary fields
  assert.deepEqual(Object.keys(tx).sort(), ["Account", "CredentialType", "Memos", "Subject", "TransactionType"]);
});

test("mainnet guard: gateway construction fails for non-testnet / mainnet endpoint", () => {
  assert.throws(() => assertSafeConfig({ ...config(), xrpl: { ...config().xrpl, network: "mainnet" as never } }), (e) => e instanceof GatewayError && e.code === "config:not-testnet");
  assert.throws(() => assertSafeConfig(config({ endpoint: "wss://xrplcluster.com" })), (e) => e instanceof GatewayError && e.code === "config:mainnet-endpoint");
});

test("rate limit sheds over-limit issuance before any expensive work", async () => {
  const { req, commitmentHex } = validRequest();
  const issuer = mockIssuer();
  const g = createGateway(config(), { midnight: mockMidnight(new Set([commitmentHex])), issuer: issuer.issuer, store: new InMemoryIdempotencyStore(), rateLimiter: { tryAcquire: () => false } });
  await assert.rejects(() => g.issueCredential(req), (e) => e instanceof GatewayError && e.code === "rate-limited");
  assert.equal(issuer.calls.issue, 0);
});

test("logging is structured and redacts the blob + nonce", async () => {
  const { req, commitmentHex } = validRequest();
  const events: { event: string; fields?: Record<string, unknown> }[] = [];
  const g = createGateway(config(), {
    midnight: mockMidnight(new Set([commitmentHex])),
    issuer: mockIssuer().issuer,
    store: new InMemoryIdempotencyStore(),
    logger: { log: (event, fields) => events.push({ event, fields }) },
  });
  await g.issueCredential(req);
  const names = events.map((e) => e.event);
  assert.ok(names.includes("request.received") && names.includes("issuance.result"), "key events logged");
  const dump = JSON.stringify(events);
  assert.ok(!dump.includes(req.signedChallengeBlob), "signed challenge blob must NOT be logged");
  assert.ok(!dump.includes(req.requestNonce), "request nonce must NOT be logged");
  assert.ok(dump.includes(req.requestCommitment) && dump.includes(req.xrplAccount), "safe fields are logged");
});

test("a rejection is logged with its code, blob still redacted", async () => {
  const { req } = validRequest();
  const events: { event: string; fields?: Record<string, unknown> }[] = [];
  const g = createGateway(config(), {
    midnight: mockMidnight(new Set()), // receipt missing -> rejection
    issuer: mockIssuer().issuer,
    store: new InMemoryIdempotencyStore(),
    logger: { log: (event, fields) => events.push({ event, fields }) },
  });
  await assert.rejects(() => g.issueCredential(req));
  const rejected = events.find((e) => e.event === "issuance.rejected");
  assert.ok(rejected && rejected.fields?.code === "receipt:missing");
  assert.ok(!JSON.stringify(events).includes(req.signedChallengeBlob));
});
