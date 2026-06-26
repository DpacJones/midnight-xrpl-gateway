// Structured, redacted logging for the gateway issuance path (Mission §18). The logger is
// injected (default: nullLogger, so the library is quiet); a service/CLI wires `consoleLogger`.
//
// Redaction discipline: log only an explicit ALLOWLIST of non-sensitive fields. Never log the
// signed challenge blob or the request nonce (private-until-submitted); the request commitment is
// the opaque public receipt id and is safe.

import type { CredentialIssueRequest } from "./types.ts";

export interface GatewayLogger {
  log(event: string, fields?: Record<string, unknown>): void;
}

/** No-op logger (default for the library / tests). */
export const nullLogger: GatewayLogger = { log() {} };

/** Structured JSON-line logger to stdout (wire this in a service/CLI). */
export const consoleLogger: GatewayLogger = {
  log(event, fields) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ t: new Date().toISOString(), src: "mxrpl-gateway", event, ...(fields ?? {}) }));
  },
};

/**
 * The ONLY request fields safe to log. Deliberately omits `signedChallengeBlob` (a signed tx) and
 * `requestNonce` (private until submission). `requestCommitment` is the public opaque receipt id.
 */
export function safeRequestFields(req: CredentialIssueRequest): Record<string, unknown> {
  return {
    contract: req.midnightContractAddress,
    requestCommitment: req.requestCommitment,
    policyEpoch: req.policyEpoch,
    xrplAccount: req.xrplAccount,
  };
}
