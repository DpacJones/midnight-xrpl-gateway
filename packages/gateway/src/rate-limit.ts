// Rate limiting for issuance requests (Mission §18). Injectable; default is an in-process
// fixed-window limiter keyed by XRPL subject account. Like the idempotency store, the default is
// single-process — a multi-process deployment needs a shared limiter (e.g. Redis).

export interface RateLimiter {
  /** Returns false if the caller is over its limit for `key` (and should be rejected). */
  tryAcquire(key: string): boolean;
}

/** Always allows — for tests / when limiting is handled elsewhere (a reverse proxy, etc.). */
export const noopRateLimiter: RateLimiter = { tryAcquire: () => true };

/** Fixed-window counter per key. `maxPerWindow` requests allowed per `windowMs`. */
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, { count: number; windowStart: number }>();

  constructor(maxPerWindow = 20, windowMs = 60_000) {
    if (maxPerWindow < 1) throw new Error("maxPerWindow must be >= 1");
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  tryAcquire(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (b.count >= this.maxPerWindow) return false;
    b.count += 1;
    return true;
  }
}
