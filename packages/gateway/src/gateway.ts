// The scoped credential gateway (Mission Profile §11). Fail-closed pipeline: every check must
// pass, in order, before exactly one fixed CredentialCreate is issued. The gateway never signs
// on behalf of the user, never accepts arbitrary tx fields, and decides nothing independently of
// the Midnight receipt.

import { xrplAddressToBytes32, requestCommitment as recomputeCommitment, toHex, fromHex } from "@mxrpl/private-credential-core";
import { verifyChallenge } from "@mxrpl/xrpl-client";
import { assertSafeConfig, type GatewayConfig } from "./config.ts";
import { idempotencyKey } from "./idempotency.ts";
import { GatewayError, type CredentialIssueRequest, type IssueRecord, type MidnightReceiptProvider, type XrplCredentialIssuer, type IdempotencyStore } from "./types.ts";

export interface GatewayDeps {
  midnight: MidnightReceiptProvider;
  issuer: XrplCredentialIssuer;
  store: IdempotencyStore;
}

const HEX32 = /^[0-9a-fA-F]{64}$/;
function assertHex32(value: string, label: string): void {
  if (typeof value !== "string" || !HEX32.test(value)) throw new GatewayError("validation:bad-hex32", `${label} must be 32-byte hex`);
}

export interface Gateway {
  issueCredential(req: CredentialIssueRequest): Promise<IssueRecord>;
}

export function createGateway(rawConfig: GatewayConfig, deps: GatewayDeps): Gateway {
  const config = assertSafeConfig(rawConfig); // hard mainnet guard at construction

  async function issueCredential(req: CredentialIssueRequest): Promise<IssueRecord> {
    // 1. strict format/length validation
    assertHex32(req.requestCommitment, "requestCommitment");
    assertHex32(req.requestNonce, "requestNonce");
    assertHex32(req.policyId, "policyId");
    if (!Number.isInteger(req.policyEpoch) || req.policyEpoch < 0 || req.policyEpoch > 0xffff) throw new GatewayError("validation:bad-epoch", "policyEpoch must fit Uint<16>");
    if (typeof req.signedChallengeBlob !== "string" || req.signedChallengeBlob.length === 0) throw new GatewayError("validation:no-blob", "missing signedChallengeBlob");
    let accountId32: Uint8Array;
    try {
      accountId32 = xrplAddressToBytes32(req.xrplAccount); // step 4 (also validates the address)
    } catch {
      throw new GatewayError("validation:bad-account", "invalid xrplAccount");
    }

    // 2. allowlist: the one configured Midnight contract + policy
    if (req.midnightContractAddress !== config.midnight.contractAddress) throw new GatewayError("allowlist:contract", "midnightContractAddress not allowlisted");
    if (req.policyId.toLowerCase() !== config.midnight.policyId32Hex.toLowerCase()) throw new GatewayError("allowlist:policy", "policyId not allowlisted");

    // 3. verify the signed, non-submittable XRPL challenge (real signature verification)
    const v = verifyChallenge(req.signedChallengeBlob, {
      account: req.xrplAccount,
      policyId32: fromHex(req.policyId),
      policyEpoch: req.policyEpoch,
      requestCommitment: fromHex(req.requestCommitment),
      requestNonce: fromHex(req.requestNonce),
    });
    if (!v.ok) throw new GatewayError("challenge:invalid", `challenge verification failed: ${v.reasons.join("; ")}`);

    // 5-6. recompute the request commitment from the AccountID + nonce + policy + epoch, require equality
    const rc = toHex(recomputeCommitment({ xrplAccountId32: accountId32, requestNonce: fromHex(req.requestNonce), policyEpoch: req.policyEpoch, policyId32: fromHex(req.policyId) }));
    if (rc !== req.requestCommitment.toLowerCase()) throw new GatewayError("commitment:mismatch", "recomputed request commitment != request");

    // 7-9. confirmed Midnight eligibility receipt in the configured contract's validated state
    const approved = await deps.midnight.isApprovedRequest({
      contractAddress: config.midnight.contractAddress,
      requestCommitmentHex: req.requestCommitment.toLowerCase(),
      transactionId: req.midnightTransactionId,
    });
    if (!approved) throw new GatewayError("receipt:missing", "no confirmed Midnight eligibility receipt for this commitment");

    // 10. durable idempotency
    const key = idempotencyKey(config.xrpl.network, req.policyId, req.requestCommitment);
    const existing = await deps.store.get(key);
    if (existing) return { ...existing, status: "idempotent" };

    // 11. if the XRPL credential already exists, return it deterministically (no second issue)
    const already = await deps.issuer.existingCredentialId({ subject: req.xrplAccount, credentialTypeHex: config.xrpl.credentialTypeHex });
    if (already) {
      const rec: IssueRecord = { status: "exists", xrplAccount: req.xrplAccount, requestCommitment: req.requestCommitment.toLowerCase(), credentialType: config.xrpl.credentialTypeHex, credentialId: already };
      await deps.store.put(key, rec);
      return rec;
    }

    // 12-15. issue exactly one fixed CredentialCreate (built + signed inside the issuer). A failure
    //         here throws BEFORE any record is persisted, so the request is not marked complete.
    const { hash, credentialId } = await deps.issuer.issueCredential({ subject: req.xrplAccount, requestCommitmentHex: req.requestCommitment.toLowerCase() });

    // 16. persist the validated result + return
    const rec: IssueRecord = { status: "issued", xrplAccount: req.xrplAccount, requestCommitment: req.requestCommitment.toLowerCase(), credentialType: config.xrpl.credentialTypeHex, credentialId, createHash: hash };
    await deps.store.put(key, rec);
    return rec;
  }

  return { issueCredential };
}
