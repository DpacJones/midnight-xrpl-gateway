// Credential bundle: what the issuer hands back to the user (Mission Profile §6.2, §13).
// Contains the credential fields, the leaf, and the Merkle inclusion path against a published
// root. It does NOT contain the holder secret — the user keeps that; the issuer only ever sees
// holder_key.

import { POLICY_V1, MERKLE_DEPTH } from "./constants.ts";
import { toHex, fromHex, randomBytes32, assertLen } from "./bytes.ts";
import { POLICY_ID32 } from "./hash.ts";
import { credentialLeaf, type PrivateCredential } from "./credential.ts";
import {
  CredentialMerkleTree,
  serializeMerklePath,
  deserializeMerklePath,
  verifyMerklePath,
  type SerializedMerklePath,
} from "./merkle.ts";

export interface CredentialBundle {
  // public policy context
  policyId32: string; // hex
  policyEpoch: number;
  credentialRoot: string; // hex — the root this bundle proves membership against
  // credential fields (private to the user; the issuer knows them — but NOT the holder secret)
  schemaVersion: number;
  credentialId: string; // hex
  holderKey: string; // hex
  birthYear: number;
  jurisdictionCode: string;
  validUntilPolicyEpoch: number;
  issuerRandomness: string; // hex
  // membership
  leaf: string; // hex (= credentialLeaf of the fields above)
  merklePath: SerializedMerklePath;
}

/** Reconstruct the in-memory PrivateCredential from a bundle (no holder secret involved). */
export function privateCredentialFromBundle(b: CredentialBundle): PrivateCredential {
  return {
    schemaVersion: b.schemaVersion,
    credentialId: assertLen(fromHex(b.credentialId), 32, "credentialId"),
    holderKey: assertLen(fromHex(b.holderKey), 32, "holderKey"),
    birthYear: b.birthYear,
    jurisdictionCode: b.jurisdictionCode,
    validUntilPolicyEpoch: b.validUntilPolicyEpoch,
    issuerRandomness: assertLen(fromHex(b.issuerRandomness), 32, "issuerRandomness"),
  };
}

/**
 * Issuer action: build a credential leaf from holder_key + synthetic attributes, insert it into
 * the current tree, and return the bundle. The `credentialRoot` captured here is the tree's root
 * at issuance — if more leaves are later inserted, re-derive paths against the final root.
 */
export function issueCredential(args: {
  tree: CredentialMerkleTree;
  holderKey: Uint8Array;
  birthYear: number;
  jurisdictionCode: string;
  validUntilPolicyEpoch: number;
  policyEpoch: number;
  schemaVersion?: number;
  credentialId?: Uint8Array;
  issuerRandomness?: Uint8Array;
}): { bundle: CredentialBundle; index: number } {
  assertLen(args.holderKey, 32, "holderKey");
  const credentialId = args.credentialId ?? randomBytes32();
  const issuerRandomness = args.issuerRandomness ?? randomBytes32();
  const schemaVersion = args.schemaVersion ?? POLICY_V1.schemaVersion;

  const cred: PrivateCredential = {
    schemaVersion,
    credentialId,
    holderKey: args.holderKey,
    birthYear: args.birthYear,
    jurisdictionCode: args.jurisdictionCode,
    validUntilPolicyEpoch: args.validUntilPolicyEpoch,
    issuerRandomness,
  };
  const leaf = credentialLeaf(cred);
  const index = args.tree.insert(leaf);
  const path = args.tree.pathFor(index);

  const bundle: CredentialBundle = {
    policyId32: toHex(POLICY_ID32),
    policyEpoch: args.policyEpoch,
    credentialRoot: toHex(args.tree.root()),
    schemaVersion,
    credentialId: toHex(credentialId),
    holderKey: toHex(args.holderKey),
    birthYear: args.birthYear,
    jurisdictionCode: args.jurisdictionCode,
    validUntilPolicyEpoch: args.validUntilPolicyEpoch,
    issuerRandomness: toHex(issuerRandomness),
    leaf: toHex(leaf),
    merklePath: serializeMerklePath(path),
  };
  return { bundle, index };
}

/** Self-consistency check: leaf matches the fields, and the path resolves to the bundle root. */
export function verifyCredentialBundle(b: CredentialBundle): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (b.schemaVersion !== POLICY_V1.schemaVersion) reasons.push(`unexpected schema version ${b.schemaVersion}`);
  const recomputedLeaf = toHex(credentialLeaf(privateCredentialFromBundle(b)));
  if (recomputedLeaf !== b.leaf) reasons.push("leaf does not match credential fields");
  const path = deserializeMerklePath(b.merklePath);
  // External-bundle strictness: production paths must be exactly MERKLE_DEPTH deep (Codex audit).
  if (path.entries.length !== MERKLE_DEPTH) reasons.push(`merkle path must have ${MERKLE_DEPTH} entries, got ${path.entries.length}`);
  if (toHex(path.leaf) !== b.leaf) reasons.push("merkle path leaf != bundle leaf");
  if (!verifyMerklePath(path, fromHex(b.credentialRoot))) reasons.push("merkle path does not resolve to credentialRoot");
  return { ok: reasons.length === 0, reasons };
}
