import { describe, expect, it } from "vitest";
import type {
  ProofBuilderClient,
  ProofRequestOutcome,
} from "./proof-builder-client.ts";
import { createProofOrchestrator } from "./proof-orchestrator.ts";

/**
 * M05-T03 Proof Orchestration evidence (Phase 4 §4.2.4, Phase 9 §16):
 * WAITING_FOR_ATTESTATION → GENERATING_PROOF → PROOF_READY lifecycle,
 * bounded stale rebuild (max 1 automatic rebuild per UI submit attempt),
 * same claimed transaction, retryable provider behavior, no loop.
 */

const TX_HASH = `0x${"12".repeat(32)}`;
const OTHER_TX = `0x${"56".repeat(32)}`;
const BYTES32 = (fill: string) => `0x${fill.repeat(32)}`;

const READY_PROOF_RAW = {
  headerNumber: 42,
  txBytes: "0x02fe",
  merkleProof: {
    root: BYTES32("dd"),
    siblings: [{ hash: BYTES32("aa"), isLeft: true }],
  },
  continuityProof: {
    lowerEndpointDigest: BYTES32("ee"),
    roots: [BYTES32("11")],
  },
};

function scriptableBuilder(
  readiness: "READY" | "NOT_ATTESTED" | "TIMEOUT",
  proofResult: ProofRequestOutcome,
  log: string[] = [],
): ProofBuilderClient {
  return {
    async checkReadiness(claimedTxHash) {
      log.push(`readiness:${claimedTxHash}`);
      if (readiness === "TIMEOUT") {
        return {
          kind: "FAILED",
          failure: { kind: "PROOF_BUILDER_TIMEOUT" },
        };
      }
      return {
        kind: "READINESS",
        readiness:
          readiness === "READY"
            ? { ready: true, blockHeight: "42" }
            : { ready: false, reason: "NOT_ATTESTED_YET" },
      };
    },
    async requestProof(claimedTxHash) {
      log.push(`proof:${claimedTxHash}`);
      return proofResult;
    },
  };
}

describe("proof orchestration lifecycle", () => {
  it("happy path: ready → proof received → PROOF_READY with normalized payload", async () => {
    const log: string[] = [];
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder(
        "READY",
        { kind: "PROOF_RECEIVED", raw: READY_PROOF_RAW },
        log,
      ),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH);
    expect(outcome.kind).toBe("PROOF_READY");
    if (outcome.kind === "PROOF_READY") {
      expect(outcome.state).toBe("PROOF_READY");
      expect(outcome.payload.chainKey).toBe(1);
      expect(outcome.payload.blockHeight).toBe("42");
    }
    expect(log).toEqual([`readiness:${TX_HASH}`, `proof:${TX_HASH}`]);
  });

  it("not-attested source stays WAITING_FOR_ATTESTATION, never rejection", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("NOT_ATTESTED", {
        kind: "PROOF_NOT_READY",
        readiness: { ready: false, reason: "NOT_ATTESTED_YET" },
      }),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH);
    expect(outcome).toEqual({
      kind: "WAITING_FOR_ATTESTATION",
      state: "WAITING_FOR_ATTESTATION",
      readiness: { ready: false, reason: "NOT_ATTESTED_YET" },
    });
  });

  it("readiness provider timeout stays retryable dependency", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("TIMEOUT", {
        kind: "PROOF_RECEIVED",
        raw: READY_PROOF_RAW,
      }),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH);
    expect(outcome).toMatchObject({
      kind: "RETRYABLE_DEPENDENCY",
      failure: { kind: "PROOF_BUILDER_TIMEOUT" },
    });
  });

  it("proof request timeout stays retryable dependency", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("READY", {
        kind: "PROOF_BUILDER_FAILED",
        failure: { kind: "PROOF_BUILDER_TIMEOUT" },
      }),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH);
    expect(outcome).toMatchObject({
      kind: "RETRYABLE_DEPENDENCY",
      state: "GENERATING_PROOF",
      failure: { kind: "PROOF_BUILDER_TIMEOUT" },
    });
  });

  it("malformed provider proof fails closed as PROOF_REJECTED (first attempt)", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("READY", {
        kind: "PROOF_RECEIVED",
        raw: { headerNumber: "garbage" },
      }),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH);
    expect(outcome).toMatchObject({
      kind: "PROOF_REJECTED",
      reason: "INVALID_BLOCK_HEIGHT",
    });
  });
});

describe("bounded stale-proof rebuild (max 1 automatic rebuild per UI submit attempt)", () => {
  it("rebuild targets the SAME claimed transaction", async () => {
    const log: string[] = [];
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder(
        "READY",
        { kind: "PROOF_RECEIVED", raw: READY_PROOF_RAW },
        log,
      ),
    });
    // First attempt on TX_HASH, then a stale-suspected rebuild.
    await orchestrator.runProofLifecycle(TX_HASH);
    const rebuild = await orchestrator.rebuildStaleProof(TX_HASH);
    expect(rebuild.kind).toBe("PROOF_READY");
    // Every recorded interaction stayed on the same claimed tx hash.
    expect(log).toEqual([
      `readiness:${TX_HASH}`,
      `proof:${TX_HASH}`,
      `readiness:${TX_HASH}`,
      `proof:${TX_HASH}`,
    ]);
    // No interaction ever touched another transaction identity.
    expect(log.some((entry) => entry.includes(OTHER_TX.slice(2, 20)))).toBe(
      false,
    );
  });

  it("rebuild that still fails returns explicit retryable condition (no loop)", async () => {
    const log: string[] = [];
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder(
        "READY",
        {
          kind: "PROOF_RECEIVED",
          raw: { headerNumber: "garbage" }, // still malformed after rebuild
        },
        log,
      ),
    });
    const rebuild = await orchestrator.rebuildStaleProof(TX_HASH);
    expect(rebuild).toEqual({
      kind: "RETRYABLE_DEPENDENCY",
      state: "PROOF_REBUILD_REQUIRED",
      reason: "STALE_PROOF_REBUILD_EXHAUSTED",
    });
    // Exactly one lifecycle pass (readiness + proof) — the exhausted budget
    // did not trigger another automatic rebuild.
    expect(log).toEqual([`readiness:${TX_HASH}`, `proof:${TX_HASH}`]);
  });

  it("a fresh run with the rebuild budget already consumed surfaces exhaustion immediately on malformed proof", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("READY", {
        kind: "PROOF_RECEIVED",
        raw: { txBytes: "0xGG" },
      }),
    });
    const outcome = await orchestrator.runProofLifecycle(TX_HASH, {
      attemptedRebuild: true,
    });
    expect(outcome).toEqual({
      kind: "RETRYABLE_DEPENDENCY",
      state: "PROOF_REBUILD_REQUIRED",
      reason: "STALE_PROOF_REBUILD_EXHAUSTED",
    });
  });

  it("successful rebuild produces PROOF_READY without creating new source identity", async () => {
    const orchestrator = createProofOrchestrator({
      proofBuilder: scriptableBuilder("READY", {
        kind: "PROOF_RECEIVED",
        raw: READY_PROOF_RAW,
      }),
    });
    const rebuild = await orchestrator.rebuildStaleProof(TX_HASH);
    if (rebuild.kind !== "PROOF_READY") throw new Error("expected ready");
    // Same canonical payload shape — the rebuild regenerated transport data
    // for the same transaction, nothing about source identity changed.
    expect(rebuild.payload.blockHeight).toBe("42");
    expect(rebuild.payload.chainKey).toBe(1);
  });
});
