// Gateway configuration + the allowlist and the hard mainnet guard. All policy/network/issuer
// values are SERVER configuration — never taken from the request.

import { GatewayError } from "./types.ts";

export interface GatewayConfig {
  midnight: {
    network: string; // e.g. "undeployed" / "testnet" — allowlisted
    contractAddress: string; // the one configured PrivateCredentialGateway contract
    policyId32Hex: string; // the one configured policy id (Bytes<32> hex)
  };
  xrpl: {
    network: "testnet"; // ONLY testnet is permitted (see assertSafeConfig)
    endpoint: string; // wss endpoint
    credentialIssuer: string; // the issuer r... account
    credentialTypeHex: string; // fixed CredentialType, uppercase hex
    expiration?: number; // optional ripple-epoch expiration
    uriHex?: string; // optional public policy URI, uppercase hex
  };
}

const MAINNET_MARKERS = ["mainnet", "s1.ripple.com", "s2.ripple.com", "xrplcluster.com"];

/**
 * Fail fast at startup if the gateway is pointed at XRPL mainnet (Mission §18: "Gateway startup
 * fails if configured for XRPL mainnet"). Also sanity-checks the allowlist is fully populated.
 */
export function assertSafeConfig(config: GatewayConfig): GatewayConfig {
  if (config.xrpl.network !== "testnet") {
    throw new GatewayError("config:not-testnet", `xrpl.network must be "testnet", got ${JSON.stringify(config.xrpl.network)}`);
  }
  const ep = config.xrpl.endpoint.toLowerCase();
  for (const m of MAINNET_MARKERS) {
    if (ep.includes(m)) throw new GatewayError("config:mainnet-endpoint", `refusing mainnet-looking endpoint: ${config.xrpl.endpoint}`);
  }
  for (const [k, v] of Object.entries({
    "midnight.contractAddress": config.midnight.contractAddress,
    "midnight.policyId32Hex": config.midnight.policyId32Hex,
    "xrpl.credentialIssuer": config.xrpl.credentialIssuer,
    "xrpl.credentialTypeHex": config.xrpl.credentialTypeHex,
  })) {
    if (!v || typeof v !== "string") throw new GatewayError("config:incomplete-allowlist", `missing config: ${k}`);
  }
  return config;
}
