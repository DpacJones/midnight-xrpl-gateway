// Witness implementations for PrivateCredentialGateway. All private inputs are sourced from a
// plain private-state object the test simulator sets per call. No witness reads ledger state.

import type { Ledger } from "../managed/contract/index.js";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type GatewayPrivateState = {
  readonly adminSecret: Uint8Array;
  readonly holderSecret: Uint8Array;
  readonly credentialId: Uint8Array;
  readonly issuerRandomness: Uint8Array;
  readonly schemaVersion: bigint;
  readonly birthYear: bigint;
  readonly jurisdiction: bigint;
  readonly validUntil: bigint;
  readonly merkleSiblings: Uint8Array[]; // length 16, each Bytes<32>
  readonly merkleGoesLeft: boolean[]; // length 16
  readonly xrplAccountId: Uint8Array;
  readonly requestNonce: Uint8Array;
};

export function createGatewayPrivateState(f: Partial<GatewayPrivateState> = {}): GatewayPrivateState {
  const z32 = () => new Uint8Array(32);
  return {
    adminSecret: f.adminSecret ?? z32(),
    holderSecret: f.holderSecret ?? z32(),
    credentialId: f.credentialId ?? z32(),
    issuerRandomness: f.issuerRandomness ?? z32(),
    schemaVersion: f.schemaVersion ?? 0n,
    birthYear: f.birthYear ?? 0n,
    jurisdiction: f.jurisdiction ?? 0n,
    validUntil: f.validUntil ?? 0n,
    merkleSiblings: f.merkleSiblings ?? Array.from({ length: 16 }, () => z32()),
    merkleGoesLeft: f.merkleGoesLeft ?? Array.from({ length: 16 }, () => false),
    xrplAccountId: f.xrplAccountId ?? z32(),
    requestNonce: f.requestNonce ?? z32(),
  };
}

type Ctx = WitnessContext<Ledger, GatewayPrivateState>;

export const witnesses = {
  adminSecret: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.adminSecret],
  holderSecret: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.holderSecret],
  credentialId: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.credentialId],
  issuerRandomness: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.issuerRandomness],
  schemaVersion: ({ privateState }: Ctx): [GatewayPrivateState, bigint] => [privateState, privateState.schemaVersion],
  birthYear: ({ privateState }: Ctx): [GatewayPrivateState, bigint] => [privateState, privateState.birthYear],
  jurisdiction: ({ privateState }: Ctx): [GatewayPrivateState, bigint] => [privateState, privateState.jurisdiction],
  validUntil: ({ privateState }: Ctx): [GatewayPrivateState, bigint] => [privateState, privateState.validUntil],
  merkleSiblings: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array[]] => [privateState, privateState.merkleSiblings],
  merkleGoesLeft: ({ privateState }: Ctx): [GatewayPrivateState, boolean[]] => [privateState, privateState.merkleGoesLeft],
  xrplAccountId: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.xrplAccountId],
  requestNonce: ({ privateState }: Ctx): [GatewayPrivateState, Uint8Array] => [privateState, privateState.requestNonce],
};
