// Gateway types + boundary interfaces. The external systems (Midnight indexer, XRPL submitter,
// idempotency store) are injected so the fail-closed pipeline (§11.2) is fully testable.

/** Strict request schema (Mission Profile §11.1). All bytes are lowercase hex. */
export interface CredentialIssueRequest {
  midnightContractAddress: string;
  midnightTransactionId: string;
  requestCommitment: string; // Bytes<32> hex
  policyId: string; // Bytes<32> hex (= POLICY_ID32)
  policyEpoch: number; // Uint<16>
  xrplAccount: string; // classic r... address (the subject)
  requestNonce: string; // Bytes<32> hex
  signedChallengeBlob: string; // the user's signed, non-submittable challenge tx
}

export type IssueStatus = "issued" | "exists" | "idempotent";

export interface IssueRecord {
  status: IssueStatus;
  xrplAccount: string;
  requestCommitment: string;
  credentialType: string; // hex
  credentialId: string; // XRPL credential ledger-entry id
  createHash?: string; // CredentialCreate tx hash (only when status === "issued")
}

/** Reads VALIDATED Midnight contract state (the indexer in production; a mock in tests). */
export interface MidnightReceiptProvider {
  /** True iff `requestCommitmentHex` is in the configured contract's `approvedRequests`. */
  isApprovedRequest(args: { contractAddress: string; requestCommitmentHex: string; transactionId: string }): Promise<boolean>;
}

/**
 * Issues the credential on XRPL. The implementation builds a FIXED CredentialCreate (no request
 * input chooses tx type/fields) and signs only with the configured issuer account.
 */
export interface XrplCredentialIssuer {
  /** Existing credential ledger-entry id for (subject, type), if one already exists. */
  existingCredentialId(args: { subject: string; credentialTypeHex: string }): Promise<string | undefined>;
  /** Create the credential; returns the validated tx hash + the credential ledger-entry id. */
  issueCredential(args: { subject: string; requestCommitmentHex: string }): Promise<{ hash: string; credentialId: string }>;
}

/** Durable idempotency: a repeated valid request returns the existing result, never re-issues. */
export interface IdempotencyStore {
  get(key: string): Promise<IssueRecord | undefined>;
  put(key: string, record: IssueRecord): Promise<void>;
}

export class GatewayError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "GatewayError";
  }
}
