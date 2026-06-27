// The Midnight browser-provider connection layer. Adapted from the canonical bboard-ui
// (BrowserDeployedBoardManager, Apache-2.0) — the spike-confirmed pattern (docs/SPIKE_BROWSER_PROVING.md):
// the WALLET (1AM) supplies the prover + indexer URIs; the proving keys are fetched as static assets;
// witnesses never leave the browser/wallet.
import { fromHex, toHex } from "@midnight-ntwrk/midnight-js-utils";
import { ConnectedAPI, type InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  Binding,
  FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger-v8";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import semver from "semver";
import { inMemoryPrivateStateProvider } from "./in-memory-private-state.ts";
import { zkConfigPath, type GatewayCircuitKeys, type GatewayPrivateState, type GatewayProviders, GatewayPrivateStateId } from "./contract.ts";

const COMPATIBLE_CONNECTOR_API_VERSION = "4.x"; // 1AM ships DApp Connector v4 (window.midnight typed by the connector pkg)

function getFirstCompatibleWallet(): InitialAPI | undefined {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find((w) => semver.satisfies(w.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION));
}

/** Poll briefly for an injected, compatible Midnight wallet (1AM/Lace) and connect. */
async function connectToWallet(networkId: string): Promise<ConnectedAPI> {
  const deadline = 5000;
  const start = performance.now();
  for (;;) {
    const initial = getFirstCompatibleWallet();
    if (initial) return initial.connect(networkId);
    if (performance.now() - start > deadline) {
      throw new Error("No compatible Midnight wallet found. Is the 1AM extension installed + enabled?");
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Connect 1AM and assemble the browser provider set for the gateway contract. */
export async function connectMidnight(networkId: string): Promise<{ providers: GatewayProviders; connectedAPI: ConnectedAPI }> {
  const connectedAPI = await connectToWallet(networkId);
  const config = await connectedAPI.getConfiguration();
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const keyMaterialProvider = new FetchZkConfigProvider<GatewayCircuitKeys>(zkConfigPath, fetch.bind(window));

  const providers: GatewayProviders = {
    privateStateProvider: inMemoryPrivateStateProvider<typeof GatewayPrivateStateId, GatewayPrivateState>(),
    zkConfigProvider: keyMaterialProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri!, keyMaterialProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const serialized = toHex(tx.serialize());
        const received = await connectedAPI.balanceUnsealedTransaction(serialized);
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>("signature", "proof", "binding", fromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
  return { providers, connectedAPI };
}
