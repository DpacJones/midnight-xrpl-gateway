// Browser wiring for the compiled PrivateCredentialGateway contract + its witnesses.
import * as Gateway from "../../../../contracts/private-credential-gateway/managed/contract/index.js";
import {
  witnesses as gatewayWitnesses,
  createGatewayPrivateState,
  type GatewayPrivateState,
} from "../../../../contracts/private-credential-gateway/src/witnesses.ts";
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

export const GatewayContractCtor = Gateway.Contract;
export const ledgerOf = Gateway.ledger;
export const pureCircuits = Gateway.pureCircuits;
export const witnesses = gatewayWitnesses;
export { createGatewayPrivateState };
export type { GatewayPrivateState };

export type GatewayContract = Gateway.Contract<GatewayPrivateState>;

export const GatewayPrivateStateId = "mxrplGatewayPrivateState";
export type GatewayPrivateStateIdType = typeof GatewayPrivateStateId;

// Only the user-facing circuit matters in the dApp; admin's setPolicyRoot runs out-of-band.
export type GatewayCircuitKeys = "setPolicyRoot" | "proveEligibility";

export type GatewayProviders = MidnightProviders<GatewayCircuitKeys, GatewayPrivateStateIdType, GatewayPrivateState>;

/** Where the ZK proving keys + zkir are served from (copied into ./dist by the build script). */
export const zkConfigPath = typeof window !== "undefined" ? window.location.origin : "";
