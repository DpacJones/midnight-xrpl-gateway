// Durable idempotency stores. The unique key is (network, policy_id, request_commitment) — a
// repeated valid request returns the existing result and never issues a second credential.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { IdempotencyStore, IssueRecord } from "./types.ts";

export function idempotencyKey(network: string, policyIdHex: string, requestCommitmentHex: string): string {
  return `${network}:${policyIdHex.toLowerCase()}:${requestCommitmentHex.toLowerCase()}`;
}

/** In-memory store — fine for a single process/test, NOT durable across restarts. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IssueRecord>();
  async get(key: string): Promise<IssueRecord | undefined> {
    return this.map.get(key);
  }
  async put(key: string, record: IssueRecord): Promise<void> {
    this.map.set(key, record);
  }
}

/**
 * File-backed store with atomic writes (write-temp + rename). Durable across restarts; sufficient
 * for the local harness. The Mission allows SQLite or an append-only local store with atomic
 * writes — this is the latter, kept dependency-free.
 */
export class FileIdempotencyStore implements IdempotencyStore {
  private readonly path: string;
  private cache: Record<string, IssueRecord>;
  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.cache = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, IssueRecord>) : {};
  }
  async get(key: string): Promise<IssueRecord | undefined> {
    return this.cache[key];
  }
  async put(key: string, record: IssueRecord): Promise<void> {
    this.cache = { ...this.cache, [key]: record };
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cache, null, 2));
    renameSync(tmp, this.path); // atomic on the same filesystem
  }
}
