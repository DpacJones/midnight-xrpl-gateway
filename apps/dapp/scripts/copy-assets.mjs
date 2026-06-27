// Portable (Windows + POSIX) copy of the contract's ZK assets into the dApp dist so the browser's
// FetchZkConfigProvider can serve them as static assets. Replaces the Unix-only `cp -r` build step.
//
// PREREQUISITE: the contract must be compiled first (managed/keys + managed/zkir). Those are produced
// by `npm run compile -w @mxrpl/private-credential-gateway-contract`, which needs the Compact toolchain
// (WSL/Linux) — same as the rest of the repo's live tooling. They are gitignored (the prover key is
// ~37 MB). This script fails with clear guidance if they're absent rather than a raw ENOENT.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const managed = resolve(here, "../../../contracts/private-credential-gateway/managed");
const dist = resolve(here, "../dist");

for (const asset of ["keys", "zkir"]) {
  const src = resolve(managed, asset);
  if (!existsSync(src)) {
    console.error(
      `\n✗ ZK assets missing: ${src}\n` +
        `  The dApp build needs the compiled contract. Compile it first (requires the Compact\n` +
        `  toolchain — WSL/Linux):\n\n` +
        `      npm run compile -w @mxrpl/private-credential-gateway-contract\n`,
    );
    process.exit(1);
  }
  cpSync(src, resolve(dist, asset), { recursive: true });
}
console.log("copied ZK assets (keys, zkir) into dist/");
