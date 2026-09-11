import type { AttestcoinProofPayloadV1 } from "@origin-duel/domain";
import type {
  ProofBuilderClient,
  ProofBuilderFailure,
  ProofReadiness,
} from "./proof-builder-client.ts";
import { normalizeAttestcoinProof } from "./proof-normalization.ts";

/**
 * Proof Orchestration (Phase 9 §16, Phase 4 §4.2.4, Phase 8 §10). Coordinators:
 * attestation readiness, proof request, normalization, and the bounded
 * stale-proof rebuild. One UI submit attempt maps to one orchestrator run —
 * at most ONE automatic rebuild when a stale/obsolete proof is suspected;
 * after that the outcome is an explicit retryable condition. No loops.
 *
 * Authority: none. This orchestrator never verifies proofs (Block Prover),
 * never accepts sources (Factory), and proof refresh always targets the SAME
 * claimed transaction — it never creates source identity or Monster identity.
 */

export type ProofLifecycleState =
  | "WAITING_FOR_ATTESTATION"
  | "GENERATING_PROOF"
  | "PROOF_READY"
  | "PROOF_REBUILD_REQUIRED";

/** Deterministic outcome of one bounded proof orchestration attempt. */
export type ProofOrchestrationOutcome =
  | {
      kind: "PROOF_READY";
      payload: AttestcoinProofPayloadV1;
      state: ProofLifecycleState;
    }
  | {
      kind: "WAITING_FOR_ATTESTATION";
      state: ProofLifecycleState;
      readiness: ProofReadiness;
    }
  | {
      kind: "RETRYABLE_DEPENDENCY";
      state: ProofLifecycleState;
      failure: ProofBuilderFailure;
    }
  | {
      kind: "RETRYABLE_DEPENDENCY";
      state: ProofLifecycleState;
      reason: "STALE_PROOF_REBUILD_EXHAUSTED";
    }
  | {
      kind: "PROOF_REJECTED";
      state: ProofLifecycleState;
      reason: string;
    };

export interface ProofOrchestrationDeps {
  readonly proofBuilder: ProofBuilderClient;
}

export function createProofOrchestrator(
  deps: ProofOrchestrationDeps,
): ProofOrchestrator {
  return {
    /**
     * Runs the canonical proof lifecycle for one claimed transaction.
     * `attemptedRebuild` carries whether the single automatic rebuild budget
     * for this UI submit attempt has already been consumed upstream (e.g. by
     * the capture layer); when true, a stale suspicion returns the explicit
     * retryable condition instead of looping another rebuild.
     */
    async runProofLifecycle(claimedTxHash, options) {
      const attemptedRebuild = options?.attemptedRebuild ?? false;
      return runLifecycle(deps.proofBuilder, claimedTxHash, attemptedRebuild);
    },

    /**
     * Stale-proof rebuild path: same claimed transaction only. The rebuild
     * budget is exactly one automatic rebuild per UI submit attempt — this
     * call IS that single rebuild; callers must not invoke it more than once
     * per attempt. After it, a still-failing verification is a retryable
     * condition the user owns, never a loop.
     */
    async rebuildStaleProof(claimedTxHash) {
      return runLifecycle(deps.proofBuilder, claimedTxHash, true);
    },
  };
}

export interface ProofOrchestrator {
  runProofLifecycle(
    claimedTxHash: string,
    options?: { attemptedRebuild?: boolean },
  ): Promise<ProofOrchestrationOutcome>;
  rebuildStaleProof(claimedTxHash: string): Promise<ProofOrchestrationOutcome>;
}

async function runLifecycle(
  proofBuilder: ProofBuilderClient,
  claimedTxHash: string,
  attemptedRebuild: boolean,
): Promise<ProofOrchestrationOutcome> {
  // 1. Readiness: is the source block attested/provable yet?
  const readiness = await proofBuilder.checkReadiness(claimedTxHash);
  if (readiness.kind === "FAILED") {
    return {
      kind: "RETRYABLE_DEPENDENCY",
      state: "WAITING_FOR_ATTESTATION",
      failure: readiness.failure,
    };
  }
  if (!readiness.readiness.ready) {
    return {
      kind: "WAITING_FOR_ATTESTATION",
      state: "WAITING_FOR_ATTESTATION",
      readiness: readiness.readiness,
    };
  }

  // 2. Request the proof (stale rebuild path re-requests the SAME tx hash).
  const request = await proofBuilder.requestProof(claimedTxHash);
  if (request.kind === "PROOF_BUILDER_FAILED") {
    return {
      kind: "RETRYABLE_DEPENDENCY",
      state: "GENERATING_PROOF",
      failure: request.failure,
    };
  }
  if (request.kind === "PROOF_NOT_READY") {
    return {
      kind: "WAITING_FOR_ATTESTATION",
      state: "WAITING_FOR_ATTESTATION",
      readiness: request.readiness,
    };
  }

  // 3. Normalize the raw provider object into the exact canonical payload.
  const normalized = normalizeAttestcoinProof(request.raw);
  if (normalized.kind === "REJECTED") {
    // Fail closed: malformed/oversized provider data never becomes domain
    // state. A malformed fresh rebuild is retryable (provider defect), but
    // when the single rebuild budget is consumed it must not loop.
    if (attemptedRebuild) {
      return {
        kind: "RETRYABLE_DEPENDENCY",
        state: "PROOF_REBUILD_REQUIRED",
        reason: "STALE_PROOF_REBUILD_EXHAUSTED",
      };
    }
    return {
      kind: "PROOF_REJECTED",
      state: "GENERATING_PROOF",
      reason: normalized.error,
    };
  }

  return {
    kind: "PROOF_READY",
    state: "PROOF_READY",
    payload: normalized.payload,
  };
}
