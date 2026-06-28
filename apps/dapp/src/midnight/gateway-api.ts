// Join the deployed gateway contract + run proveEligibility in-wallet. Mirrors our proven harness
// (apps/e2e-harness/src/app.ts): CompiledContract + findDeployedContract from @midnight-ntwrk/midnight-js.
// In the browser the ZK assets come from providers.zkConfigProvider (FetchZkConfigProvider), so the
// compiled contract carries witnesses but NOT file assets.
//
// The exact browser join/prove shape is validated live once 1AM + a deployed contract are present.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract, type DeployedContract, type FoundContract } from "@midnight-ntwrk/midnight-js/contracts";
import {
  GatewayContractCtor,
  witnesses,
  createGatewayPrivateState,
  GatewayPrivateStateId,
  zkConfigPath,
  type GatewayContract,
  type GatewayProviders,
} from "./contract.ts";

// withCompiledFileAssets points at the origin; in the browser the FetchZkConfigProvider in `providers`
// is what actually serves keys/zkir over HTTP — reconcile these two at live-validation time.
const gatewayCompiledContract = CompiledContract.make("private-credential-gateway", GatewayContractCtor).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

/** Constructor args: (admin_key, policy_id, initial_root, initial_epoch, cutoff_year, allowed_jur). */
export type GatewayCtorArgs = [Uint8Array, Uint8Array, Uint8Array, bigint, bigint, bigint];

/** Admin one-time deploy (via the connected wallet — e.g. 1AM on Preview). Returns the deployed contract. */
export async function deployGateway(providers: GatewayProviders, args: GatewayCtorArgs): Promise<DeployedContract<GatewayContract>> {
  return deployContract(providers, {
    compiledContract: gatewayCompiledContract,
    privateStateId: GatewayPrivateStateId,
    initialPrivateState: createGatewayPrivateState(),
    args,
  });
}

export async function joinGateway(providers: GatewayProviders, contractAddress: string): Promise<FoundContract<GatewayContract>> {
  return findDeployedContract(providers, {
    contractAddress,
    compiledContract: gatewayCompiledContract,
    privateStateId: GatewayPrivateStateId,
    initialPrivateState: createGatewayPrivateState(),
  });
}

export type DeployedGateway = Awaited<ReturnType<typeof joinGateway>>;

/** Set the holder's witness inputs, then prove eligibility (real ZK proof, in-wallet). */
export async function proveEligibility(
  providers: GatewayProviders,
  deployed: DeployedGateway,
  contractAddress: string,
  witnessInputs: Parameters<typeof createGatewayPrivateState>[0],
) {
  // the scoped in-memory provider keys private state by contract address — set it before writing.
  providers.privateStateProvider.setContractAddress(contractAddress);
  await providers.privateStateProvider.set(GatewayPrivateStateId, createGatewayPrivateState(witnessInputs));
  return deployed.callTx.proveEligibility();
}
