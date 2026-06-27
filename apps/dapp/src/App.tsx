import { useEffect, useState } from "react";
import { connectMidnight, listWallets, type WalletInfo } from "./midnight/providers.ts";
import { gatewayHealthy } from "./lib/gateway-client.ts";

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? "undeployed";
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8787";
const PROVER_OVERRIDE = import.meta.env.VITE_PROVER_URI; // optional: force a local proof server

// First UI: pick a Midnight wallet (1AM / Lace), connect, and show WHERE proving happens (the honest
// hosted-vs-local privacy indicator). The full flow (prove -> sign challenge -> request credential ->
// accept -> gated payment) builds on this once a contract is deployed.
export function App() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [connectedVia, setConnectedVia] = useState<string | null>(null);
  const [coinKey, setCoinKey] = useState<string | null>(null);
  const [prover, setProver] = useState<{ uri: string; kind: "local" | "hosted" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gatewayUp, setGatewayUp] = useState<boolean | null>(null);

  useEffect(() => {
    void gatewayHealthy(GATEWAY_URL).then(setGatewayUp);
    // wallet connectors inject asynchronously — poll briefly until one appears
    let tries = 0;
    const id = setInterval(() => {
      const found = listWallets();
      if (found.length || ++tries > 20) {
        setWallets(found);
        if (found.length) clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  async function connect(wallet: WalletInfo): Promise<void> {
    setError(null);
    setStatus("connecting");
    setConnectedVia(wallet.name);
    try {
      const conn = await connectMidnight(NETWORK_ID, wallet.key, PROVER_OVERRIDE);
      setCoinKey(conn.providers.walletProvider.getCoinPublicKey());
      setProver(conn.prover);
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

        {status !== "connected" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {wallets.length === 0 ? (
              <p style={{ color: "#999", margin: 0 }}>No Midnight wallet detected. Install <strong>1AM</strong> or <strong>Lace</strong> and refresh.</p>
            ) : (
              wallets.map((w) => (
                <button
                  key={w.key}
                  onClick={() => connect(w)}
                  disabled={status === "connecting"}
                  style={{ padding: "10px 18px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc" }}
                >
                  {status === "connecting" && connectedVia === w.name ? "Connecting…" : `Connect ${w.name}`}
                  <span style={{ color: "#aaa", fontSize: 11 }}> v{w.apiVersion}</span>
                </button>
              ))
            )}
          </div>
        )}

        {status === "connected" && (
          <>
            <p style={{ margin: "0 0 8px" }}>Connected via <strong>{connectedVia}</strong> ✓</p>
            {prover && (
              <p
                style={{
                  margin: "0 0 12px",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: prover.kind === "local" ? "#e8f7ee" : "#fdf6e3",
                  border: `1px solid ${prover.kind === "local" ? "#a3d9b8" : "#e8d59a"}`,
                }}
              >
                {prover.kind === "local"
                  ? "🔒 Proving locally — your private inputs never leave your machine."
                  : "☁ Hosted prover — your private inputs are sent to the prover to generate the proof (never on-chain)."}
                <br />
                <code style={{ color: "#888", fontSize: 11 }}>{prover.uri}</code>
              </p>
            )}
            {coinKey && (
              <p style={{ marginTop: 4, wordBreak: "break-all", fontSize: 13 }}>
                Coin public key: <code>{coinKey}</code>
              </p>
            )}
          </>
        )}

        {error && <p style={{ marginTop: 12, color: "#c0392b" }}>⚠ {error}</p>}
      </section>

      <p style={{ color: "#999", fontSize: 13, marginTop: 24 }}>
        Next steps in the flow: prove eligibility (in-wallet) → sign the XRPL challenge → request the credential from the gateway service → accept it → credential-gated payment.
      </p>
    </main>
  );
}
