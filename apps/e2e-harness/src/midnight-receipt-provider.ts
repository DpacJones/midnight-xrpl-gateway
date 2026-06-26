// Real MidnightReceiptProvider for the gateway: reads the deployed contract's VALIDATED state
// from the indexer and checks approvedRequests membership. This is the production wiring of the
// boundary the §17.4 tests mock.

import { fromHex } from "@mxrpl/private-credential-core";
import type { MidnightReceiptProvider } from "@mxrpl/gateway";
import { ledgerOf } from "./contract.ts";

interface PublicDataProvider {
  queryContractState(address: string): Promise<unknown>;
}

export function createMidnightReceiptProvider(publicDataProvider: PublicDataProvider, configuredContractAddress: string): MidnightReceiptProvider {
  return {
    async isApprovedRequest({ contractAddress, requestCommitmentHex }) {
      // The gateway already allowlists the contract; re-check here too (defence in depth).
      if (contractAddress !== configuredContractAddress) return false;
      const st = await publicDataProvider.queryContractState(contractAddress);
      if (!st) return false;
      const led = ledgerOf((st as { data?: unknown }).data ?? st) as { approvedRequests: { member(b: Uint8Array): boolean } };
      return led.approvedRequests.member(fromHex(requestCommitmentHex));
    },
  };
}
