// Real MidnightReceiptProvider for the service: constructs an indexer public-data provider and
// checks approvedRequests membership in the configured contract's VALIDATED state. Read-only — no
// wallet, no proof server (the service never proves; it only observes the receipt).

import { fromHex } from "@mxrpl/private-credential-core";
import type { MidnightReceiptProvider } from "@mxrpl/gateway";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { ledger as ledgerOf } from "../../../contracts/private-credential-gateway/managed/contract/index.js";

export function createIndexerReceiptProvider(
  indexerUri: string,
  indexerWsUri: string,
  configuredContractAddress: string,
): MidnightReceiptProvider {
  const publicDataProvider = indexerPublicDataProvider(indexerUri, indexerWsUri);
  return {
    async isApprovedRequest({ contractAddress, requestCommitmentHex }) {
      if (contractAddress !== configuredContractAddress) return false; // defence in depth
      const st = await publicDataProvider.queryContractState(contractAddress);
      if (!st) return false;
      // queryContractState returns the contract state; ledgerOf decodes its StateValue. Newer/older
      // shapes expose it as `.data` or directly — handle both, cast to ledgerOf's exact param type.
      const stateValue = (st as { data?: unknown }).data ?? st;
      const led = ledgerOf(stateValue as Parameters<typeof ledgerOf>[0]) as {
        approvedRequests: { member(b: Uint8Array): boolean };
      };
      return led.approvedRequests.member(fromHex(requestCommitmentHex));
    },
  };
}
