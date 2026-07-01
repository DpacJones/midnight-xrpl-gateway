// The XRPL half of the flow, ported from the proven Node E2E (apps/e2e-harness/run-e2e.ts) to the
// browser. Uses an EPHEMERAL faucet-funded testnet wallet — never a real/personal key. xrpl works in
// the browser over WebSocket; the throwaway seed lives only in the dApp session.
import { Client, Wallet } from "xrpl";
import { buildChallenge } from "@mxrpl/xrpl-client";
import { POLICY_ID32, fromHex } from "@mxrpl/private-credential-core";
import { withTimeout, TIMEOUTS } from "./timeout.ts";

const TESTNET = "wss://s.altnet.rippletest.net:51233";

export interface TxResult {
  code: string;
  hash: string;
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(TESTNET, { connectionTimeout: TIMEOUTS.xrplConnect });
  try {
    // If the testnet WebSocket is unreachable, connect() can hang; bound it so callers get an error
    // instead of a spinner that never resolves (e.g. the "Funding…" button stuck forever).
    await withTimeout(c.connect(), TIMEOUTS.xrplConnect, "XRPL testnet connection");
    return await fn(c);
  } finally {
    // Always attempt to close — covers the timed-out/half-open case too. Ignore if never connected.
    try {
      await c.disconnect();
    } catch {
      /* nothing to close */
    }
  }
}

async function submit(c: Client, wallet: Wallet, tx: Record<string, unknown>): Promise<TxResult> {
  const prepared = await c.autofill(tx as never);
  const res = await c.submitAndWait(wallet.sign(prepared).tx_blob);
  const code = (res.result.meta as { TransactionResult?: string })?.TransactionResult ?? "?";
  return { code, hash: res.result.hash };
}

/** Generate + faucet-fund an ephemeral XRPL testnet wallet (the demo "user"). */
export async function createFundedWallet(): Promise<Wallet> {
  return withClient(async (c) => (await c.fundWallet()).wallet);
}

/** Build + sign the non-submittable XRPL challenge that binds the request to this account. */
export function signChallenge(wallet: Wallet, requestCommitmentHex: string, requestNonceHex: string, policyEpoch = 1): string {
  const challenge = buildChallenge({
    account: wallet.classicAddress,
    policyId32: POLICY_ID32,
    policyEpoch,
    requestCommitment: fromHex(requestCommitmentHex),
    requestNonce: fromHex(requestNonceHex),
  });
  return wallet.sign(challenge as never).tx_blob;
}

/** Accept the issued credential (CredentialAccept). */
export async function acceptCredential(wallet: Wallet, issuer: string, credentialTypeHex: string): Promise<TxResult> {
  return withClient((c) =>
    submit(c, wallet, { TransactionType: "CredentialAccept", Account: wallet.classicAddress, Issuer: issuer, CredentialType: credentialTypeHex }),
  );
}

export interface GatedDemoResult {
  authorizer: string;
  withoutCredential: string; // expect tecNO_PERMISSION
  withCredential: string; // expect tesSUCCESS
  hashes: { without: string; with: string };
}

/** Demo XRPL's native enforcement: a deposit-authorized account that only accepts credential-bearing
 *  payments. Funds a fresh authorizer, enables Deposit Authorization + credential preauth, then pays
 *  it without (denied) and with (allowed) the credential. */
export async function gatedPaymentDemo(user: Wallet, credentialId: string, issuer: string, credentialTypeHex: string): Promise<GatedDemoResult> {
  return withClient(async (c) => {
    const authorizer = (await c.fundWallet()).wallet;
    await submit(c, authorizer, { TransactionType: "AccountSet", Account: authorizer.classicAddress, SetFlag: 9 }); // asfDepositAuth
    await submit(c, authorizer, {
      TransactionType: "DepositPreauth",
      Account: authorizer.classicAddress,
      AuthorizeCredentials: [{ Credential: { Issuer: issuer, CredentialType: credentialTypeHex } }],
    });
    const pay = (creds?: string[]) => ({
      TransactionType: "Payment",
      Account: user.classicAddress,
      Destination: authorizer.classicAddress,
      Amount: "1000000",
      ...(creds ? { CredentialIDs: creds } : {}),
    });
    const without = await submit(c, user, pay());
    const withCred = await submit(c, user, pay([credentialId]));
    return {
      authorizer: authorizer.classicAddress,
      withoutCredential: without.code,
      withCredential: withCred.code,
      hashes: { without: without.hash, with: withCred.hash },
    };
  });
}
