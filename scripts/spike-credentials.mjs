// Phase 0 XRPL Protocol Spike: native credential-gated Deposit Authorization lifecycle.
// Proves on live XRPL testnet that:
//   1. CredentialCreate (issuer -> subject)
//   2. CredentialAccept (subject)
//   3. Authorizer enables Deposit Authorization + credential-based DepositPreauth
//   4. Payment to authorizer WITHOUT CredentialIDs  -> FAILS
//   5. Payment to authorizer WITH accepted CredentialID -> SUCCEEDS
//   6. CredentialDelete (issuer)
//   7. Payment with deleted credential -> FAILS
//
// Testnet only. Funds 3 fresh faucet wallets. Never reads or writes a real seed.
// Output: prints a structured JSON summary and writes spike-artifact.json (gitignored).

import { Client, Wallet, convertStringToHex } from "xrpl";
import { writeFileSync } from "node:fs";

const ENDPOINT = "wss://s.altnet.rippletest.net:51233";
const CREDENTIAL_TYPE_LABEL = "ATL_MIDNIGHT_ELIGIBLE_V1";
const CREDENTIAL_TYPE_HEX = convertStringToHex(CREDENTIAL_TYPE_LABEL).toUpperCase();
const asfDepositAuth = 9;

const artifact = {
  network: ENDPOINT,
  credentialTypeLabel: CREDENTIAL_TYPE_LABEL,
  credentialTypeHex: CREDENTIAL_TYPE_HEX,
  accounts: {},
  steps: [],
};

function log(...a) { console.log(...a); }

async function fund(client, label) {
  const { wallet, balance } = await client.fundWallet();
  artifact.accounts[label] = { address: wallet.classicAddress, balanceXRP: balance };
  log(`funded ${label}: ${wallet.classicAddress} (${balance} XRP)`);
  return wallet;
}

// Submit a tx, autofill+sign+wait. Returns the validated result without throwing on tec codes.
async function submit(client, wallet, tx, stepName) {
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  let res;
  try {
    res = await client.submitAndWait(signed.tx_blob);
  } catch (e) {
    const entry = { step: stepName, submitError: String(e?.message || e), tx: redact(tx) };
    artifact.steps.push(entry);
    log(`  [${stepName}] SUBMIT ERROR: ${entry.submitError}`);
    return entry;
  }
  const code = res.result.meta?.TransactionResult;
  const entry = {
    step: stepName,
    hash: res.result.hash,
    ledgerIndex: res.result.ledger_index,
    result: code,
    validated: res.result.validated === true,
    tx: redact(tx),
  };
  artifact.steps.push(entry);
  log(`  [${stepName}] ${code}  hash=${res.result.hash}  ledger=${res.result.ledger_index}`);
  return entry;
}

function redact(tx) {
  // Transactions here contain only public addresses + public credential metadata. No secrets.
  return { ...tx };
}

async function findCredentialId(client, subjectAddress, issuerAddress) {
  const resp = await client.request({
    command: "account_objects",
    account: subjectAddress,
    type: "credential",
    ledger_index: "validated",
  });
  const objs = resp.result.account_objects || [];
  const match = objs.find(
    (o) => o.Issuer === issuerAddress && o.CredentialType === CREDENTIAL_TYPE_HEX
  );
  return { id: match?.index, accepted: match?.Flags ? (match.Flags & 0x00010000) !== 0 : undefined, raw: match };
}

async function main() {
  const client = new Client(ENDPOINT);
  await client.connect();
  log(`connected: ${ENDPOINT}`);
  log(`credentialType hex: ${CREDENTIAL_TYPE_HEX}`);

  log("\n--- funding 3 testnet wallets ---");
  const issuer = await fund(client, "issuer");
  const user = await fund(client, "user");        // credential subject + payment sender
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
    AuthorizeCredentials: [
      { Credential: { Issuer: issuer.classicAddress, CredentialType: CREDENTIAL_TYPE_HEX } },
    ],
  }, "DepositPreauth");

  log("\n--- step 4: Payment user -> authorizer WITHOUT CredentialIDs (expect FAIL) ---");
  const denied = await submit(client, user, {
    TransactionType: "Payment",
    Account: user.classicAddress,
    Destination: authorizer.classicAddress,
    Amount: "1000000",
  }, "PaymentWithoutCredential");

  log("\n--- step 5: Payment user -> authorizer WITH CredentialIDs (expect SUCCESS) ---");
  const allowed = await submit(client, user, {
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

  log("\n--- step 7: Payment with deleted credential (expect FAIL) ---");
  const afterDelete = await submit(client, user, {
    TransactionType: "Payment",
    Account: user.classicAddress,
    Destination: authorizer.classicAddress,
    Amount: "1000000",
    CredentialIDs: [cred.id],
  }, "PaymentAfterRevocation");

  await client.disconnect();

  // Evaluate gate
  const enforcement =
    denied.result && denied.result !== "tesSUCCESS" &&
    allowed.result === "tesSUCCESS" &&
    afterDelete.result && afterDelete.result !== "tesSUCCESS";

  artifact.gate = {
    deniedWithoutCredential: denied.result,
    allowedWithCredential: allowed.result,
    failedAfterRevocation: afterDelete.result,
    NATIVE_CREDENTIAL_ENFORCEMENT_PROVEN: Boolean(enforcement),
  };

  writeFileSync(new URL("../spike-artifact.json", import.meta.url), JSON.stringify(artifact, null, 2));
  log("\n=================== GATE ===================");
  log(JSON.stringify(artifact.gate, null, 2));
  log("artifact written: spike-artifact.json");
  if (!enforcement) {
    log("GATE RED: native credential enforcement NOT proven as expected.");
    process.exitCode = 1;
  } else {
    log("GATE GREEN: native credential-gated Deposit Authorization enforced on XRPL testnet.");
  }
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e?.message || e);
  try { writeFileSync(new URL("../spike-artifact.json", import.meta.url), JSON.stringify({ ...artifact, fatalError: String(e?.message || e) }, null, 2)); } catch {}
  process.exit(1);
});
