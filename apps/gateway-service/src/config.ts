// Service configuration from environment. All policy/network/issuer values are SERVER config —
// never taken from a request. The issuer seed is a secret (env only, never committed).

import { assertSafeConfig, type GatewayConfig } from "@mxrpl/gateway";

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`missing required env var: ${name}`);
  return v.trim();
}
function opt(name: string, dflt: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : dflt;
}
function num(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v || v.trim() === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${name} must be a number, got ${JSON.stringify(v)}`);
  return n;
}

export interface ServiceConfig {
  readonly gateway: GatewayConfig;
  readonly issuerSeed: string;
  readonly indexerUri: string;
  readonly indexerWsUri: string;
  readonly networkId: string;
  readonly port: number;
  readonly idempotencyFile: string;
  readonly ipRate: { maxPerWindow: number; windowMs: number };
  readonly subjectRate: { maxPerWindow: number; windowMs: number };
  readonly trustProxy: boolean;
}

export function loadServiceConfig(): ServiceConfig {
  // assertSafeConfig is the hard mainnet guard — the process refuses to start pointed at mainnet.
  const gateway = assertSafeConfig({
    midnight: {
      network: opt("MXRPL_MIDNIGHT_NETWORK", "undeployed"),
      contractAddress: req("MXRPL_CONTRACT_ADDRESS"),
      policyId32Hex: req("MXRPL_POLICY_ID").toLowerCase(),
    },
    xrpl: {
      network: "testnet", // literal; the guard enforces testnet-only
      endpoint: req("MXRPL_XRPL_ENDPOINT"),
      credentialIssuer: req("MXRPL_CREDENTIAL_ISSUER"),
      credentialTypeHex: req("MXRPL_CREDENTIAL_TYPE_HEX").toUpperCase(),
      ...(process.env.MXRPL_CREDENTIAL_EXPIRATION ? { expiration: num("MXRPL_CREDENTIAL_EXPIRATION", 0) } : {}),
      ...(process.env.MXRPL_CREDENTIAL_URI_HEX ? { uriHex: process.env.MXRPL_CREDENTIAL_URI_HEX.trim().toUpperCase() } : {}),
    },
  });
  return {
    gateway,
    issuerSeed: req("MXRPL_ISSUER_SEED"),
    indexerUri: req("MXRPL_INDEXER_URI"),
    indexerWsUri: req("MXRPL_INDEXER_WS_URI"),
    networkId: opt("MXRPL_NETWORK_ID", "undeployed"),
    port: num("PORT", 8787),
    idempotencyFile: opt("MXRPL_IDEMPOTENCY_FILE", "./gateway-idempotency.json"),
    ipRate: { maxPerWindow: num("MXRPL_IP_RATE_MAX", 60), windowMs: num("MXRPL_IP_RATE_WINDOW_MS", 60_000) },
    subjectRate: { maxPerWindow: num("MXRPL_SUBJECT_RATE_MAX", 20), windowMs: num("MXRPL_SUBJECT_RATE_WINDOW_MS", 60_000) },
    trustProxy: opt("MXRPL_TRUST_PROXY", "false") === "true",
  };
}
