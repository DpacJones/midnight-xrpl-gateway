import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout, TimeoutError } from "../src/lib/timeout.ts";

test("withTimeout resolves when the promise settles in time", async () => {
  const value = await withTimeout(Promise.resolve(42), 1000, "fast op");
  assert.equal(value, 42);
});

test("withTimeout rejects with a TimeoutError when the promise is too slow", async () => {
  const slow = new Promise((resolve) => setTimeout(resolve, 100));
  await assert.rejects(
    withTimeout(slow, 5, "slow op"),
    (e) => e instanceof TimeoutError && /slow op/.test((e as Error).message),
  );
});

test("withTimeout propagates the original rejection (not a timeout) when the promise fails first", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("boom")), 1000, "op"), /boom/);
});

test("withTimeout does not fire the timeout after the promise already resolved", async () => {
  // If the timer were not cleared, a late timeout could reject an already-settled promise. Resolve
  // fast under a short timeout, then wait past it — no error should surface.
  const value = await withTimeout(Promise.resolve("ok"), 20, "op");
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(value, "ok");
});
