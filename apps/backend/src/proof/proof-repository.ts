import type { AttestcoinProofPayloadV1 } from "@origin-duel/domain";
import type { DbOrTrx } from "../db/index.ts";

/**
 * Proof transport checkpoint persistence over the existing M04
 * capture_requests table (proof_payload jsonb + proof_generated_at). This is
 * regenerable transport data storage only — persisted JSONB is never proof
 * authority; only the Block Prover/Factory verification path is. Proof
 * replacement stays keyed to the same capture request row: same claimant +
 * claimed transaction identity, bounded update, no source job/sourceTx
 * consumption, no cooldown mutation.
 */

export type ProofSaveOutcome =
  | { kind: "SAVED"; captureRequestRef: string }
  | { kind: "NOT_FOUND" };

export type StoredProofCheckpoint = {
  captureRequestRef: string;
  proofPayload: AttestcoinProofPayloadV1 | null;
  proofGeneratedAt: Date | null;
};

/**
 * Loads the regenerable proof transport checkpoint for one claimant +
 * claimed transaction. Returns undefined when no capture request row exists.
 */
export async function loadProofCheckpoint(
  db: DbOrTrx,
  claimant: Uint8Array,
  claimedTxHash: Uint8Array,
): Promise<StoredProofCheckpoint | undefined> {
  const rows = await db
    .selectFrom("capture_requests")
    .select(["capture_request_ref", "proof_payload", "proof_generated_at"])
    .where("claimant", "=", claimant)
    .where("claimed_tx_hash", "=", claimedTxHash)
    .execute();
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  return {
    captureRequestRef: row.capture_request_ref,
    proofPayload:
      (row.proof_payload as AttestcoinProofPayloadV1 | null) ?? null,
    proofGeneratedAt: row.proof_generated_at ?? null,
  };
}

/**
 * Replaces the stored proof transport payload for an existing capture
 * request (same source/capture identity). Bounded single-row update: no new
 * capture request, no source job mutation, no sourceTx consumption, no
 * cooldown change.
 */
export async function saveProofCheckpoint(
  db: DbOrTrx,
  claimant: Uint8Array,
  claimedTxHash: Uint8Array,
  proofPayload: AttestcoinProofPayloadV1,
  generatedAt: Date,
): Promise<ProofSaveOutcome> {
  const rows = await db
    .updateTable("capture_requests")
    .set({
      proof_payload: proofPayload as unknown as Record<string, unknown>,
      proof_generated_at: generatedAt,
      updated_at: generatedAt,
    })
    .where("claimant", "=", claimant)
    .where("claimed_tx_hash", "=", claimedTxHash)
    .returning("capture_request_ref")
    .executeTakeFirst();
  return rows === undefined
    ? { kind: "NOT_FOUND" }
    : { kind: "SAVED", captureRequestRef: rows.capture_request_ref };
}
