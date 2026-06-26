// Real XrplCredentialIssuer — builds the FIXED CredentialCreate (no arbitrary fields), signs only
// with the configured issuer account, submits to the configured testnet, and resolves the
// credential ledger-entry id (same proven flow as the Phase 0 protocol spike). Exercised by the
// Phase 5 end-to-end CLI; the §17.4 unit tests use a mock instead (no live connection).
//
// The issuer seed is supplied at construction (from a local .env in the gateway process) and is
// NEVER part of a request. It must match config.xrpl.credentialIssuer.

import { Client, Wallet } from "xrpl";
import { buildCredentialCreate } from "./credential-create.ts";
import type { GatewayConfig } from "./config.ts";
import type { XrplCredentialIssuer } from "./types.ts";

export function createXrplCredentialIssuer(config: GatewayConfig, issuerSeed: string): XrplCredentialIssuer {
  const wallet = Wallet.fromSeed(issuerSeed);
  if (wallet.classicAddress !== config.xrpl.credentialIssuer) {
    throw new Error("issuer seed does not match configured xrpl.credentialIssuer");
  }

  async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client(config.xrpl.endpoint);
    await c.connect();
    try {
      return await fn(c);
    } finally {
      if (c.isConnected()) await c.disconnect();
    }
  }

  async function findCredentialId(c: Client, subject: string): Promise<string | undefined> {
    const resp = await c.request({ command: "account_objects", account: subject, type: "credential", ledger_index: "validated" });
    const objs = (resp.result.account_objects ?? []) as { Issuer?: string; CredentialType?: string; index?: string }[];
    return objs.find((o) => o.Issuer === config.xrpl.credentialIssuer && o.CredentialType === config.xrpl.credentialTypeHex)?.index;
  }

  return {
    existingCredentialId: ({ subject }) => withClient((c) => findCredentialId(c, subject)),
    issueCredential: ({ subject, requestCommitmentHex }) =>
      withClient(async (c) => {
        const prepared = await c.autofill(buildCredentialCreate(config, subject, requestCommitmentHex) as never);
        const signed = wallet.sign(prepared);
        const res = await c.submitAndWait(signed.tx_blob);
        const code = res.result.meta && typeof res.result.meta === "object" ? (res.result.meta as { TransactionResult?: string }).TransactionResult : undefined;
        if (code !== "tesSUCCESS") throw new Error(`CredentialCreate failed: ${code}`);
        const credentialId = await findCredentialId(c, subject);
        if (!credentialId) throw new Error("credential ledger-entry id not found after CredentialCreate");
        return { hash: res.result.hash, credentialId };
      }),
  };
}
