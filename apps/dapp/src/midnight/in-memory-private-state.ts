// In-memory PrivateStateProvider for the browser (witness inputs live only for the session — never
// persisted). This is midnight-js's own reference implementation (Apache-2.0, via bboard-ui) — the
// FULL interface, incl. setContractAddress + export/import that deployContract requires.
import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";

export const inMemoryPrivateStateProvider = <PSI extends PrivateStateId, PS = unknown>(): PrivateStateProvider<PSI, PS> => {
  const privateStates = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let contractAddress: ContractAddress | null = null;

  const requireContractAddress = (): ContractAddress => {
    if (contractAddress === null) {
      throw new Error("Contract address not set. Call setContractAddress() before accessing private state.");
    }
    return contractAddress;
  };
  const getScopedStates = (address: ContractAddress): Map<PSI, PS> => {
    let scoped = privateStates.get(address);
    if (!scoped) {
      scoped = new Map<PSI, PS>();
      privateStates.set(address, scoped);
    }
    return scoped;
  };
  const encode = <T>(value: T): string => JSON.stringify(value);
  const decode = <T>(value: string): T => JSON.parse(value) as T;
  const exportPrivateStatePayload = (address: ContractAddress): Record<string, string> =>
    Object.fromEntries(Array.from(getScopedStates(address).entries()).map(([id, value]) => [id, encode(value)]));
  const exportSigningKeyPayload = (): Record<ContractAddress, SigningKey> => Object.fromEntries(signingKeys.entries());

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },
    set(key: PSI, state: PS): Promise<void> {
      getScopedStates(requireContractAddress()).set(key, state);
      return Promise.resolve();
    },
    get(key: PSI): Promise<PS | null> {
      return Promise.resolve(getScopedStates(requireContractAddress()).get(key) ?? null);
    },
    remove(key: PSI): Promise<void> {
      getScopedStates(requireContractAddress()).delete(key);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      privateStates.delete(requireContractAddress());
      return Promise.resolve();
    },
    setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(address, signingKey);
      return Promise.resolve();
    },
    getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return Promise.resolve(signingKeys.get(address) ?? null);
    },
    removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(address);
      return Promise.resolve();
    },
    clearSigningKeys(): Promise<void> {
      signingKeys.clear();
      return Promise.resolve();
    },
    exportPrivateStates(options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      void options;
      const address = requireContractAddress();
      return Promise.resolve({
        format: "midnight-private-state-export",
        encryptedPayload: encode({ contractAddress: address, states: exportPrivateStatePayload(address) }),
        salt: "in-memory-private-state-provider",
      });
    },
    importPrivateStates(exportData: PrivateStateExport, options?: ImportPrivateStatesOptions): Promise<ImportPrivateStatesResult> {
      const address = requireContractAddress();
      const conflictStrategy = options?.conflictStrategy ?? "error";
      const payload = decode<{ contractAddress?: ContractAddress; states?: Record<string, string> }>(exportData.encryptedPayload);
      const states = payload.states ?? {};
      const scoped = getScopedStates(address);
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [rawStateId, serialized] of Object.entries(states)) {
        const stateId = rawStateId as PSI;
        if (scoped.has(stateId)) {
          if (conflictStrategy === "skip") {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === "error") {
            return Promise.reject(new Error(`Private state conflict for '${stateId}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        scoped.set(stateId, decode<PS>(serialized));
      }
      return Promise.resolve({ imported, skipped, overwritten });
    },
    exportSigningKeys(options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      void options;
      return Promise.resolve({
        format: "midnight-signing-key-export",
        encryptedPayload: encode({ keys: exportSigningKeyPayload() }),
        salt: "in-memory-signing-key-provider",
      });
    },
    importSigningKeys(exportData: SigningKeyExport, options?: ImportSigningKeysOptions): Promise<ImportSigningKeysResult> {
      const conflictStrategy = options?.conflictStrategy ?? "error";
      const payload = decode<{ keys?: Record<ContractAddress, SigningKey> }>(exportData.encryptedPayload);
      const keys = payload.keys ?? {};
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [address, signingKey] of Object.entries(keys)) {
        if (signingKeys.has(address)) {
          if (conflictStrategy === "skip") {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === "error") {
            return Promise.reject(new Error(`Signing key conflict for '${address}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        signingKeys.set(address, signingKey);
      }
      return Promise.resolve({ imported, skipped, overwritten });
    },
  };
};
