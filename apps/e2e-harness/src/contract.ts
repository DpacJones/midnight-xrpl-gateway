// Wiring for the compiled PrivateCredentialGateway contract + its witnesses.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as Gateway from "../../../contracts/private-credential-gateway/managed/contract/index.js";
import { witnesses as gatewayWitnesses, type GatewayPrivateState } from "../../../contracts/private-credential-gateway/src/witnesses.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** Directory holding the compiled ZK assets (keys/, zkir/, contract/). */
export const zkConfigPath = resolve(here, "../../../contracts/private-credential-gateway/managed");

export type GatewayContract = Gateway.Contract<GatewayPrivateState>;
export const ContractCtor = Gateway.Contract;
export const ledgerOf = Gateway.ledger;
export const pureCircuits = Gateway.pureCircuits;

export const GatewayPrivateStateId = "mxrplGatewayPrivateState";
export const witnesses = gatewayWitnesses;
export type { GatewayPrivateState };
