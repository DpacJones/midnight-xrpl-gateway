// The gateway HTTP service. Wraps the audited `createGateway` pipeline as a backend (the XRPL
// issuer seed is held here, never in the browser). One real endpoint: POST /issue-credential.
//
//   tsx --env-file=.env src/server.ts     (or set the MXRPL_* env vars; see .env.example)
//
// Defence layers: pre-auth IP rate limit (transport) -> the gateway's own fail-closed pipeline
// (validation -> allowlist -> real challenge sig -> POST-auth per-subject rate limit -> receipt ->
// idempotent issue). Testnet only (assertSafeConfig refuses mainnet at startup).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import {
  createGateway,
  createXrplCredentialIssuer,
  FileIdempotencyStore,
  consoleLogger,
  FixedWindowRateLimiter,
  GatewayError,
  type CredentialIssueRequest,
} from "@mxrpl/gateway";
import { loadServiceConfig } from "./config.ts";
import { createIndexerReceiptProvider } from "./receipt-provider.ts";

const cfg = loadServiceConfig();
setNetworkId(cfg.networkId as never);

const gateway = createGateway(cfg.gateway, {
  midnight: createIndexerReceiptProvider(cfg.indexerUri, cfg.indexerWsUri, cfg.gateway.midnight.contractAddress),
  issuer: createXrplCredentialIssuer(cfg.gateway, cfg.issuerSeed),
  store: new FileIdempotencyStore(cfg.idempotencyFile),
  logger: consoleLogger,
  rateLimiter: new FixedWindowRateLimiter(cfg.subjectRate.maxPerWindow, cfg.subjectRate.windowMs),
});

// Pre-auth transport-layer limiter (per Codex's §18 follow-up): shed obvious floods by caller IP
// BEFORE any work, complementing the gateway's post-auth per-subject limiter.
const ipLimiter = new FixedWindowRateLimiter(cfg.ipRate.maxPerWindow, cfg.ipRate.windowMs);

const MAX_BODY = 16 * 1024; // issuance requests are tiny; cap to avoid memory abuse
const STATUS_BY_CODE: Record<string, number> = { "rate-limited": 429, "receipt:missing": 403 };

const CORS_ORIGIN = process.env.MXRPL_CORS_ORIGIN ?? "*"; // allow the dApp origin (demo default: any)

function send(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(s),
    "access-control-allow-origin": CORS_ORIGIN,
  });
  res.end(s);
}

function clientIp(req: IncomingMessage): string {
  if (cfg.trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function statusFor(e: GatewayError): number {
  if (STATUS_BY_CODE[e.code]) return STATUS_BY_CODE[e.code];
  if (e.code.startsWith("config:")) return 500;
  return 400; // validation / allowlist / challenge / commitment
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    // CORS preflight for the browser dApp's POST /issue-credential
    res.writeHead(204, {
      "access-control-allow-origin": CORS_ORIGIN,
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && req.url === "/health") {
      send(res, 200, { ok: true, contract: cfg.gateway.midnight.contractAddress, issuer: cfg.gateway.xrpl.credentialIssuer });
      return;
    }
    if (req.method === "POST" && req.url === "/issue-credential") {
      if (!ipLimiter.tryAcquire(clientIp(req))) {
        send(res, 429, { error: "rate-limited", message: "too many requests from this source" });
        return;
      }
      let parsed: CredentialIssueRequest;
      try {
        parsed = JSON.parse(await readBody(req)) as CredentialIssueRequest;
      } catch (e) {
        if (e instanceof Error && e.message === "body too large") {
          send(res, 413, { error: "payload-too-large", message: "request body exceeds 16 KiB" });
        } else {
          send(res, 400, { error: "bad-json", message: "body must be a JSON CredentialIssueRequest" });
        }
        return;
      }
      try {
        // The gateway re-validates every field; the parsed body is untrusted input.
        const rec = await gateway.issueCredential(parsed);
        send(res, 200, rec);
      } catch (e) {
        if (e instanceof GatewayError) {
          send(res, statusFor(e), { error: e.code, message: e.message });
        } else {
          console.error(JSON.stringify({ event: "internal-error", message: e instanceof Error ? e.message : String(e) }));
          send(res, 500, { error: "internal" });
        }
      }
      return;
    }
    send(res, 404, { error: "not-found" });
  } catch {
    send(res, 500, { error: "internal" });
  }
});

server.listen(cfg.port, () => {
  console.log(
    JSON.stringify({
      event: "listening",
      port: cfg.port,
      contract: cfg.gateway.midnight.contractAddress,
      xrplIssuer: cfg.gateway.xrpl.credentialIssuer,
      midnightNetwork: cfg.gateway.midnight.network,
    }),
  );
});
