// Bound any promise with a time limit so a call that never settles — a dismissed wallet popup, a
// dropped connection, an unresponsive service — rejects instead of leaving the UI stuck on a
// loading flag forever. Callers already handle rejection; this just guarantees one arrives.
//
// Used for the wallet popup + XRPL WebSocket connects (which return plain promises). Gateway HTTP
// calls instead pass `AbortSignal.timeout(TIMEOUTS.gatewayFetch)` to fetch (native, abortable) and
// map the abort back to a TimeoutError — so every external boundary shares the same TIMEOUTS table.

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Shared timeouts (ms). Generous enough that a legitimate slow-but-working call never trips them. */
export const TIMEOUTS = {
  walletConnect: 120_000, // wallet connect — the user may need to approve a popup
  walletOp: 30_000, // quick wallet reads after approval (getConfiguration / getShieldedAddresses)
  prove: 180_000, // real ZK proof (~20s typical; a hosted prover can be slower)
  xrplConnect: 20_000, // XRPL testnet WebSocket connect
  gatewayFetch: 20_000, // gateway HTTP service request
} as const;

/**
 * Resolve/reject with `promise`, but reject with a TimeoutError if it has not settled within `ms`.
 * `label` names the operation so the user sees which step timed out. The underlying promise's
 * result (or error) is always handled, so a late settlement never becomes an unhandled rejection.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`${label} did not complete within ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
