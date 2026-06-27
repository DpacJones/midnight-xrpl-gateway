// Minimal in-memory PrivateStateProvider for the browser (the user's witness inputs live only for
// the session — they are never persisted). Mirrors the bboard-ui approach.
import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";

export function inMemoryPrivateStateProvider<K extends string, V>(): PrivateStateProvider<K, V> {
  const states = new Map<K, V>();
  const signingKeys = new Map<string, Uint8Array>();
  return {
    set: async (id: K, state: V) => {
      states.set(id, state);
    },
    get: async (id: K) => states.get(id) ?? null,
    remove: async (id: K) => {
      states.delete(id);
    },
    clear: async () => {
      states.clear();
    },
    setSigningKey: async (address: string, key: Uint8Array) => {
      signingKeys.set(address, key);
    },
    getSigningKey: async (address: string) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address: string) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
    },
  } as unknown as PrivateStateProvider<K, V>;
}
