/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
  /** Optional: force a local proof server (e.g. http://localhost:6300) for full proving locality. */
  readonly VITE_PROVER_URI?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
