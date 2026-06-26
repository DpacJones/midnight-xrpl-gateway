// Local standalone Midnight devnet endpoints (node 0.22.3 / indexer 4.0.0 / proof 8.0.3).
// See vault: References/Midnight/Build gotchas — pad-tag hashing, lean proving, devnet, Node-TS.

export interface HarnessConfig {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export const standaloneConfig: HarnessConfig = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

// Seed of the wallet pre-funded in the genesis block of a local dev node (CFG_PRESET=dev).
// Standalone use only — no value on any real network; preprod has no genesis wallet.
export const GENESIS_MINT_WALLET_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
