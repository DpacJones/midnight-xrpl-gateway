// Phase 0 XRPL Protocol Spike: native credential-gated Deposit Authorization lifecycle.
// Proves on live XRPL testnet that an account is denied a payment to a deposit-auth
// destination unless it holds an *accepted* credential of a specific issuer+type, and
// that deleting the credential re-blocks the payment.
//
// Strict gate (per Codex audit): every one of the 8 steps must return its EXACT expected
// result code AND be validated. Any deviation fails the gate.
//
// Testnet only. Funds 3 fresh faucet wallets. Never reads or writes a real seed.
// Output: prints a structured JSON summary and writes spike-artifact.json (gitignored).
// The artifact records the *submitted* (autofilled) transaction for each step — i.e. the
// exact fields that were signed, including Fee, Sequence, and LastLedgerSequence.

import { Client, convertStringToHex } from "xrpl";
import { writeFileSync } from "node:fs";

const ENDPOINT = "wss://s.altnet.rippletest.net:51233";
const CREDENTIAL_TYPE_LABEL = "ATL_MIDNIGHT_ELIGIBLE_V1";
const CREDENTIAL_TYPE_HEX = convertStringToHex(CREDENTIAL_TYPE_LABEL).toUpperCase();
const asfDepositAuth = 9;
const lsfAccepted = 0x00010000;

// Exact result code each step must produce. The gate asserts these precisely.
const EXPECTED = {
  CredentialCreate: "tesSUCCESS",
  CredentialAccept: "tesSUCCESS",
  EnableDepositAuth: "tesSUCCESS",
  DepositPreauth: "tesSUCCESS",
  PaymentWithoutCredential: "tecNO_PERMISSION",
  PaymentWithCredential: "tesSUCCESS",
  CredentialDelete: "tesSUCCESS",
  PaymentAfterRevocation: "tecBAD_CREDENTIALS",
};

const artifact = {
  network: ENDPOINT,
  credentialTypeLabel: CREDENTIAL_TYPE_LABEL,
  credentialTypeHex: CREDENTIAL_TYPE_HEX,
  expectedResults: EXPECTED,
  accounts: {},
  steps: [],
  failures: [],
};

const log = (...a) => console.log(...a);

async function fund(client, label) {
  const { wallet, balance } = await client.fundWallet();
  artifact.accounts[label] = { address: wallet.classicAddress, balanceXRP: balance };
  log(`funded ${label}: ${wallet.classicAddress} (${balance} XRP)`);
  return wallet;
}

// Autofill + sign + submitAndWait. Records the submitted (autofilled) tx and asserts the
// exact expected result code + validated flag. submitAndWait resolves (does not throw) for
// tec* results — those are validated-but-failed and are how we capture the negative paths.
async function submit(client, wallet, tx, stepName) {
  const expected = EXPECTED[stepName];
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  let entry;
  try {
    const res = await client.submitAndWait(signed.tx_blob);
    const code = res.result.meta?.TransactionResult;
    const validated = res.result.validated === true;
    const pass = code === expected && validated;
    entry = {
      step: stepName,
      expected,
      result: code,
      validated,
      pass,
      hash: res.result.hash,
      ledgerIndex: res.result.ledger_index,
      submittedTx: prepared, // exact signed fields: Fee, Sequence, LastLedgerSequence, Flags, ...
    };
    log(`  [${stepName}] ${code} (expected ${expected})  validated=${validated}  ${pass ? "PASS" : "FAIL"}  hash=${res.result.hash}`);
  } catch (e) {
    entry = { step: stepName, expected, result: null, validated: false, pass: false, submitError: String(e?.message || e), submittedTx: prepared };
    log(`  [${stepName}] SUBMIT ERROR: ${entry.submitError}  FAIL`);
  }
  artifact.steps.push(entry);
  if (!entry.pass) artifact.failures.push(stepName);
  return entry;
}

async function findCredentialId(client, subjectAddress, issuerAddress) {
  const resp = await client.request({
    command: "account_objects",
    account: subjectAddress,
    type: "credential",
    ledger_index: "validated",
  });
  const objs = resp.result.account_objects || [];
  const match = objs.find((o) => o.Issuer === issuerAddress && o.CredentialType === CREDENTIAL_TYPE_HEX);
  return { id: match?.index, accepted: match?.Flags ? (match.Flags & lsfAccepted) !== 0 : false, raw: match };
}

async function run(client) {
  log(`connected: ${ENDPOINT}`);
  log(`credentialType hex: ${CREDENTIAL_TYPE_HEX}`);

  log("\n--- funding 3 testnet wallets ---");
  const issuer = await fund(client, "issuer");
  const user = await fund(client, "user");             // credential subject + payment sender
  const authorizer = await fund(client, "authorizer"); // deposit-auth recipient

  log("\n--- step 1: CredentialCreate (issuer -> user) ---");
  await submit(client, issuer, {
    TransactionType: "CredentialCreate",
    Account: issuer.classicAddress,
    Subject: user.classicAddress,
    CredentialType: CREDENTIAL_TYPE_HEX,
  }, "CredentialCreate");

  log("\n--- step 2: CredentialAccept (user) ---");
  await submit(client, user, {
    TransactionType: "CredentialAccept",
    Account: user.classicAddress,
    Issuer: issuer.classicAddress,
    CredentialType: CREDENTIAL_TYPE_HEX,
  }, "CredentialAccept");

  log("\n--- resolve credential ledger entry id ---");
  const cred = await findCredentialId(client, user.classicAddress, issuer.classicAddress);
  artifact.credentialId = cred.id;
  artifact.credentialAcceptedFlag = cred.accepted;
  log(`  credentialId=${cred.id}  acceptedFlag=${cred.accepted}`);
  if (!cred.id) throw new Error("could not resolve credential ledger entry id after accept");
  if (!cred.accepted) throw new Error("credential present but not marked accepted");

  log("\n--- step 3a: authorizer enables Deposit Authorization ---");
  await submit(client, authorizer, {
    TransactionType: "AccountSet",
    Account: authorizer.classicAddress,
    SetFlag: asfDepositAuth,
  }, "EnableDepositAuth");

  log("\n--- step 3b: authorizer DepositPreauth (credential-based) ---");
  await submit(client, authorizer, {
    TransactionType: "DepositPreauth",
    Account: authorizer.classicAddress,
    AuthorizeCredentials: [{ Credential: { Issuer: issuer.classicAddress, CredentialType: CREDENTIAL_TYPE_HEX } }],
  }, "DepositPreauth");

  log("\n--- step 4: Payment user -> authorizer WITHOUT CredentialIDs (expect tecNO_PERMISSION) ---");
  await submit(client, user, {
    TransactionType: "Payment",
    Account: user.classicAddress,
    Destination: authorizer.classicAddress,
    Amount: "1000000",
  }, "PaymentWithoutCredential");

  log("\n--- step 5: Payment user -> authorizer WITH CredentialIDs (expect tesSUCCESS) ---");
  await submit(client, user, {
    TransactionType: "Payment",
    Account: user.classicAddress,
    Destination: authorizer.classicAddress,
    Amount: "1000000",
    CredentialIDs: [cred.id],
  }, "PaymentWithCredential");

  log("\n--- step 6: CredentialDelete (issuer) ---");
  await submit(client, issuer, {
    TransactionType: "CredentialDelete",
    Account: issuer.classicAddress,
    Subject: user.classicAddress,
    CredentialType: CREDENTIAL_TYPE_HEX,
  }, "CredentialDelete");

  log("\n--- step 7: Payment with deleted credential (expect tecBAD_CREDENTIALS) ---");
  await submit(client, user, {
    TransactionType: "Payment",
    Account: user.classicAddress,
    Destination: authorizer.classicAddress,
    Amount: "1000000",
    CredentialIDs: [cred.id],
  }, "PaymentAfterRevocation");
}

async function main() {
  const client = new Client(ENDPOINT);
  await client.connect();
  try {
    await run(client);
  } finally {
    if (client.isConnected()) await client.disconnect();
  }

  // Strict gate: every expected step present, exact code, validated, and no failures.
  const expectedSteps = Object.keys(EXPECTED);
  const allPresent = expectedSteps.every((s) => artifact.steps.some((e) => e.step === s && e.pass));
  const enforcement = allPresent && artifact.failures.length === 0 && artifact.steps.length === expectedSteps.length;

  artifact.gate = {
    stepsRun: artifact.steps.length,
    stepsExpected: expectedSteps.length,
    failures: artifact.failures,
    NATIVE_CREDENTIAL_ENFORCEMENT_PROVEN: Boolean(enforcement),
  };

  writeFileSync(new URL("../spike-artifact.json", import.meta.url), JSON.stringify(artifact, null, 2));
  log("\n=================== GATE ===================");
  log(JSON.stringify(artifact.gate, null, 2));
  log("artifact written: spike-artifact.json");
  if (!enforcement) {
    log("GATE RED: strict per-step assertions did not all pass.");
    process.exitCode = 1;
  } else {
    log("GATE GREEN: all 8 steps returned their exact expected code and were validated.");
  }
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e?.message || e);
  try {
    writeFileSync(new URL("../spike-artifact.json", import.meta.url), JSON.stringify({ ...artifact, fatalError: String(e?.message || e) }, null, 2));
  } catch {}
  process.exit(1);
});
