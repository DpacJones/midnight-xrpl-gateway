// The ONE fixed CredentialCreate the gateway will ever build (Mission §11.3, §11.5). Every field
// comes from server config + the verified subject + the request commitment. The request cannot
// choose the transaction type, issuer, credential type, URI, expiration, fee, or memos.

import { convertStringToHex } from "xrpl";
import type { GatewayConfig } from "./config.ts";

export const REQUEST_MEMO_TYPE_HEX = convertStringToHex("midnight-request").toUpperCase();

export interface FixedCredentialCreate {
  TransactionType: "CredentialCreate";
  Account: string;
  Subject: string;
  CredentialType: string;
  Expiration?: number;
  URI?: string;
  Memos: { Memo: { MemoType: string; MemoData: string } }[];
}

/** Build the fixed CredentialCreate. `subject` is the gateway-verified XRPL account; requestCommitmentHex is the opaque receipt link. */
export function buildCredentialCreate(config: GatewayConfig, subject: string, requestCommitmentHex: string): FixedCredentialCreate {
  const tx: FixedCredentialCreate = {
    TransactionType: "CredentialCreate",
    Account: config.xrpl.credentialIssuer,
    Subject: subject,
    CredentialType: config.xrpl.credentialTypeHex,
    Memos: [{ Memo: { MemoType: REQUEST_MEMO_TYPE_HEX, MemoData: requestCommitmentHex.toUpperCase() } }],
  };
  if (config.xrpl.expiration !== undefined) tx.Expiration = config.xrpl.expiration;
  if (config.xrpl.uriHex !== undefined) tx.URI = config.xrpl.uriHex.toUpperCase();
  return tx;
}
