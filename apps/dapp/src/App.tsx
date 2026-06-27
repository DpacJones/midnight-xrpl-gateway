import { useEffect, useState } from "react";
import { connectMidnight } from "./midnight/providers.ts";
import { gatewayHealthy } from "./lib/gateway-client.ts";

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? "undeployed";
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8787";

// First UI: connect 1AM + show the gateway-service health. The full flow (prove -> sign challenge ->
// request credential -> accept -> gated payment) is wired on top of this once 1AM + a deployed
// contract are available for live validation.
export function App() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [coinKey, setCoinKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gatewayUp, setGatewayUp] = useState<boolean | null>(null);

  useEffect(() => {
    void gatewayHealthy(GATEWAY_URL).then(setGatewayUp);
  }, []);

  async function connect(): Promise<void> {
    setError(null);
    setStatus("connecting");
    try {
      const { providers } = await connectMidnight(NETWORK_ID);
      setCoinKey(providers.walletProvider.getCoinPublicKey());
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 4 }}>Private Credential Gateway</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Midnight × XRPL — prove eligibility privately, then let XRPL enforce the credential.</p>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginTop: 24 }}>
        <p style={{ margin: "0 0 12px" }}>
          Gateway service: {gatewayUp === null ? "checking…" : gatewayUp ? "🟢 up" : "🔴 unreachable"} · Network: <code>{NETWORK_ID}</code>
        </p>
        <button onClick={connect} disabled={status === "connecting"} style={{ padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}>
          {status === "connecting" ? "Connecting…" : status === "connected" ? "Connected ✓" : "Connect 1AM wallet"}
        </button>
        {coinKey && (
          <p style={{ marginTop: 12, wordBreak: "break-all", fontSize: 13 }}>
            Coin public key: <code>{coinKey}</code>
          </p>
        )}
        {error && <p style={{ marginTop: 12, color: "#c0392b" }}>⚠ {error}</p>}
      </section>

      <p style={{ color: "#999", fontSize: 13, marginTop: 24 }}>
        Next steps in the flow: prove eligibility (in-wallet) → sign the XRPL challenge → request the credential from the gateway service → accept it → credential-gated payment.
      </p>
    </main>
  );
}
