// Deploy/join helpers for PrivateCredentialGateway.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import type { DeployedContract, FoundContract } from "@midnight-ntwrk/midnight-js/contracts";
import { ContractCtor, GatewayPrivateStateId, witnesses, zkConfigPath, type GatewayContract, type GatewayPrivateState } from "./contract.js";
import type { GatewayProviders } from "./providers.js";

export type DeployedGateway = DeployedContract<GatewayContract> | FoundContract<GatewayContract>;

export const gatewayCompiledContract = CompiledContract.make("private-credential-gateway", ContractCtor).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

/** Constructor args: (admin_key, policy_id, initial_root, initial_epoch, cutoff_year, allowed_jur). */
export type GatewayCtorArgs = [Uint8Array, Uint8Array, Uint8Array, bigint, bigint, bigint];

export const deployGateway = (providers: GatewayProviders, initialPrivateState: GatewayPrivateState, args: GatewayCtorArgs): Promise<DeployedGateway> =>
  deployContract(providers, {
    compiledContract: gatewayCompiledContract,
    privateStateId: GatewayPrivateStateId,
    initialPrivateState,
    args,
  });

export const joinGateway = (providers: GatewayProviders, contractAddress: string, initialPrivateState: GatewayPrivateState): Promise<DeployedGateway> =>
  findDeployedContract(providers, {
    contractAddress,
    compiledContract: gatewayCompiledContract,
    privateStateId: GatewayPrivateStateId,
    initialPrivateState,
  });
