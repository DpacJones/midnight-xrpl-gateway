// Portable (Windows + POSIX) copy of the contract's ZK assets into the dApp dist so the browser's
// FetchZkConfigProvider can serve them as static assets. Replaces the Unix-only `cp -r` build step.
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const managed = resolve(here, "../../../contracts/private-credential-gateway/managed");
const dist = resolve(here, "../dist");

for (const asset of ["keys", "zkir"]) {
  cpSync(resolve(managed, asset), resolve(dist, asset), { recursive: true });
}
console.log("copied ZK assets (keys, zkir) into dist/");
