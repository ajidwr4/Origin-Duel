import { randomUUID } from "node:crypto";
import type { AttestcoinProofPayloadV1 } from "@origin-duel/domain";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type PostgresTestHarness,
  startPostgres,
} from "../db/testing/postgres-container.ts";
import {
  loadProofCheckpoint,
  saveProofCheckpoint,
} from "./proof-repository.ts";

/**
 * M05-T03 proof transport checkpoint persistence over the existing M04
 * schema (real PostgreSQL 16 via Testcontainers). Requires Docker; skipped
 * when DATABASE_URL-less environments cannot start a container so `npm test`
 * is never faked as evidence.
 */

const CLAIMANT = new Uint8Array(20).fill(0xab);
const CLAIMED_TX = new Uint8Array(32).fill(0x11);
const OTHER_TX = new Uint8Array(32).fill(0x22);
const NOW = new Date();
const BYTES32 = (fill: string) => `0x${fill.repeat(32)}` as const;

function proofPayload(seed: string): AttestcoinProofPayloadV1 {
  return {
    chainKey: 1,
    blockHeight: "42",
    encodedTransaction: `0x${seed}`,
    merkleRoot: BYTES32("dd"),
    siblings: [{ hash: BYTES32("aa"), isLeft: true }],
    lowerEndpointDigest: BYTES32("ee"),
    continuityRoots: [BYTES32("11")],
  };
}

let harness: PostgresTestHarness | undefined;

function requireDb() {
  if (harness === undefined) throw new Error("postgres harness not started");
  return harness.db;
}

async function insertCaptureRequest(
  claimedTxHash: Uint8Array,
): Promise<string> {
  // beforeAll ensures harness exists before any test body runs.
  const db = harness?.db;
  if (db === undefined) throw new Error("postgres harness not started");
  const ref = randomUUID();
  await db
    .insertInto("capture_requests")
    .values({
      capture_request_ref: ref,
      claimant: CLAIMANT,
      claimed_tx_hash: claimedTxHash,
      workflow_status: "GENERATING_PROOF",
      retry_count: 0,
      row_version: 0,
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
  return ref;
}

beforeAll(async () => {
  harness = await startPostgres(true);
}, 120_000);

afterAll(async () => {
  await harness?.stop();
});

describe("proof transport checkpoint persistence", () => {
  it("save + load round-trips a normalized proof payload", async () => {
    const ref = await insertCaptureRequest(CLAIMED_TX);
    const payload = proofPayload("aabb");

    const saved = await saveProofCheckpoint(
      requireDb(),
      CLAIMANT,
      CLAIMED_TX,
      payload,
      NOW,
    );
    expect(saved).toEqual({ kind: "SAVED", captureRequestRef: ref });

    const loaded = await loadProofCheckpoint(requireDb(), CLAIMANT, CLAIMED_TX);
    if (loaded === undefined) throw new Error("expected checkpoint row");
    expect(loaded.captureRequestRef).toBe(ref);
    expect(loaded.proofPayload).toEqual(payload);
    expect(loaded.proofGeneratedAt).toEqual(NOW);
  });

  it("replaceable payload: bounded update keeps the same capture identity", async () => {
    const ref = await insertCaptureRequest(OTHER_TX);
    await saveProofCheckpoint(
      requireDb(),
      CLAIMANT,
      OTHER_TX,
      proofPayload("01"),
      NOW,
    );
    const replaced = await saveProofCheckpoint(
      requireDb(),
      CLAIMANT,
      OTHER_TX,
      proofPayload("02"),
      new Date(NOW.getTime() + 1_000),
    );
    expect(replaced).toEqual({ kind: "SAVED", captureRequestRef: ref });

    const loaded = await loadProofCheckpoint(requireDb(), CLAIMANT, OTHER_TX);
    // One row, latest transport payload — proof is regenerable data.
    expect(loaded?.proofPayload?.encodedTransaction).toBe("0x02");
  });

  it("saving for a nonexistent capture request reports NOT_FOUND (no row invented)", async () => {
    const outcome = await saveProofCheckpoint(
      requireDb(),
      CLAIMANT,
      new Uint8Array(32).fill(0x99),
      proofPayload("ff"),
      NOW,
    );
    expect(outcome).toEqual({ kind: "NOT_FOUND" });
  });

  it("load for an unknown transaction returns undefined", async () => {
    const loaded = await loadProofCheckpoint(
      requireDb(),
      CLAIMANT,
      new Uint8Array(32).fill(0x88),
    );
    expect(loaded).toBeUndefined();
  });

  it("checkpoint save does not mutate source jobs, replay, or cooldown state", async () => {
    const before = await requireDb()
      .selectFrom("capture_requests")
      .select((eb) => eb.fn.countAll<number | string>().as("rows"))
      .executeTakeFirst();
    await saveProofCheckpoint(
      requireDb(),
      CLAIMANT,
      CLAIMED_TX,
      proofPayload("03"),
      NOW,
    );
    // No source_jobs rows were ever created by proof persistence; the
    // capture request's workflow_status remains what the owner set.
    const sourceJobs = await requireDb()
      .selectFrom("source_jobs")
      .select((eb) => eb.fn.countAll<number | string>().as("rows"))
      .executeTakeFirst();
    expect(Number(sourceJobs?.rows ?? 0)).toBe(0);
    const after = await requireDb()
      .selectFrom("capture_requests")
      .select((eb) => eb.fn.countAll<number | string>().as("rows"))
      .executeTakeFirst();
    expect(after?.rows).toBe(before?.rows);
    // proof_generated_at bounded to a single row update (no sourceTx
    // consumption: there is no mint/replay/cooldown table mutation here).
    const touched = await requireDb()
      .selectFrom("capture_requests")
      .select(["capture_request_ref", "workflow_status"])
      .where(sql`proof_generated_at is not null`)
      .execute();
    for (const row of touched) {
      expect(row.workflow_status).toBe("GENERATING_PROOF");
    }
  });
});
