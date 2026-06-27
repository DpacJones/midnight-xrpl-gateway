// Typed client for the gateway HTTP service (POST /issue-credential). The dApp calls this AFTER the
// on-chain proof lands + the user signs the XRPL challenge.
import type { CredentialIssueRequest, IssueRecord } from "@mxrpl/gateway";

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
    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
