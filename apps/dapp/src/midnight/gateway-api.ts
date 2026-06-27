// Join the deployed gateway contract + run proveEligibility in-wallet. Mirrors our proven harness
// (apps/e2e-harness/src/app.ts): CompiledContract + findDeployedContract from @midnight-ntwrk/midnight-js.
// In the browser the ZK assets come from providers.zkConfigProvider (FetchZkConfigProvider), so the
// compiled contract carries witnesses but NOT file assets.
//
// The exact browser join/prove shape is validated live once 1AM + a deployed contract are present.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { findDeployedContract, type FoundContract } from "@midnight-ntwrk/midnight-js/contracts";
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
  witnessInputs: Parameters<typeof createGatewayPrivateState>[0],
) {
  await providers.privateStateProvider.set(GatewayPrivateStateId, createGatewayPrivateState(witnessInputs));
  return deployed.callTx.proveEligibility();
}
