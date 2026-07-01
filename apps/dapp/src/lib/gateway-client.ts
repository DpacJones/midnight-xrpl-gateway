// Typed client for the gateway HTTP service (POST /issue-credential). The dApp calls this AFTER the
// on-chain proof lands + the user signs the XRPL challenge.
import type { CredentialIssueRequest, IssueRecord } from "@mxrpl/gateway";
import { TIMEOUTS } from "./timeout.ts";

export class GatewayServiceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "GatewayServiceError";
    this.status = status;
    this.code = code;
  }
}

/** Request issuance of one XRPL credential from the gateway service. */
export async function requestCredential(serviceUrl: string, request: CredentialIssueRequest): Promise<IssueRecord> {
  const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/issue-credential`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(TIMEOUTS.gatewayFetch), // don't hang the flow on an unresponsive gateway
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { error?: string; message?: string };
    throw new GatewayServiceError(res.status, b.error ?? "error", b.message);
  }
  return body as IssueRecord;
}

export async function gatewayHealthy(serviceUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(TIMEOUTS.gatewayFetch) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface GatewayInfo {
  ok: boolean;
  contract: string;
  issuer: string; // the XRPL issuer account — needed for CredentialAccept + the gated payment
}

export async function getGatewayInfo(serviceUrl: string): Promise<GatewayInfo> {
  const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(TIMEOUTS.gatewayFetch) });
  if (!res.ok) throw new Error(`gateway /health ${res.status}`);
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error("gateway /health returned a non-JSON response");
  return body as GatewayInfo;
}
