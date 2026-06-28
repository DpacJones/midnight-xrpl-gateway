// Isolate where merkleSiblings loses elements: run the dApp's exact parse + build in Node.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCredential, buildProveRequest } from "../src/lib/credential.ts";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(resolve(here, "../.demo-deploy.json"), "utf8");
const cred = parseCredential(json);
console.log("credential merkleSiblingsHex length:", cred.merkleSiblingsHex.length);
const req = buildProveRequest(cred, "rPh5WN21VmquoJX5V8fVTjTRcCWFoF9Tp6");
const sibs = req.witnessInputs.merkleSiblings;
console.log("witness merkleSiblings length:", sibs.length);
console.log("all Uint8Array(32)?:", sibs.every((s) => s instanceof Uint8Array && s.length === 32));
console.log("first bytes:", sibs.map((s) => s[0]).join(","));
