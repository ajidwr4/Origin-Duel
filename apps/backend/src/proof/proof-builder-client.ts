/**
 * Proof Builder transport client (Phase 9 §16, Attestcoin-Protocol Prover
 * Server). The hosted Prover endpoints (/api/v1/proof-by-tx/{chainKey}/{txHash}
 * and /api/v1/attested-height/{chainKey}) are untrusted, replaceable HTTP
 * dependencies — never proof authority. Cryptographic verification lives in
 * the Block Prover precompile; application acceptance lives in the Factory.
 * Provider-specific raw response objects never cross this boundary.
 */

export const ATTESTCOIN_CHAIN_KEY = 1;

/** Readiness answer from the Prover attestation cache. */
export type ProofReadiness =
  | { ready: true; blockHeight: string }
  | { ready: false; reason: "NOT_ATTESTED_YET" | "UNKNOWN_TX" };

/** Retryable dependency conditions, never authoritative rejection. */
export type ProofBuilderFailure =
  | { kind: "PROOF_BUILDER_TIMEOUT" }
  | { kind: "PROOF_BUILDER_UNAVAILABLE" }
  | { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" };

export type ProofRequestOutcome =
  | { kind: "PROOF_RECEIVED"; raw: unknown }
  | { kind: "PROOF_NOT_READY"; readiness: ProofReadiness }
  | { kind: "PROOF_BUILDER_FAILED"; failure: ProofBuilderFailure };

/**
 * Live hosted-builder error body observed as HTTP 404:
 * {"code":"TxHashNotFound"|"BlockNotOnSourceChain","message":...,"retriable":bool}
 */
export interface RawProofBuilderErrorBody {
  code?: unknown;
  message?: unknown;
  retriable?: unknown;
}

export interface ProofBuilderClient {
  checkReadiness(
    claimedTxHash: string,
  ): Promise<
    | { kind: "READINESS"; readiness: ProofReadiness }
    | { kind: "FAILED"; failure: ProofBuilderFailure }
  >;
  requestProof(claimedTxHash: string): Promise<ProofRequestOutcome>;
}

/**
 * Fetch-based Proof Builder adapter. The base URL is injected
 * deployment/environment config — never hardcoded. `fetchFn` is injectable
 * so tests script deterministic responses without any network access.
 */
export function createProofBuilderClient(
  baseUrl: string,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  requestTimeoutMs = 5_000,
): ProofBuilderClient {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  interface CallOutcome {
    status: number;
    body: unknown;
  }

  async function call(
    path: string,
  ): Promise<
    | { kind: "OK"; result: CallOutcome }
    | { kind: "FAILED"; failure: ProofBuilderFailure }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchFn(`${normalizedBase}${path}`, {
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => undefined);
      // The live builder answers not-ready conditions with HTTP 404 + a JSON
      // error body (TxHashNotFound / BlockNotOnSourceChain); pass the status
      // through so requestProof can classify provider intent precisely.
      return { kind: "OK", result: { status: response.status, body } };
    } catch (error) {
      const name = (error as { name?: string } | undefined)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        return { kind: "FAILED", failure: { kind: "PROOF_BUILDER_TIMEOUT" } };
      }
      // Network-level failure (fetch TypeError etc).
      return { kind: "FAILED", failure: { kind: "PROOF_BUILDER_UNAVAILABLE" } };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async checkReadiness(_claimedTxHash) {
      // Hosted prover attestation-cache readiness: the highest source chain
      // height that has been attested on Creditcoin, per chainKey. It is a
      // cache-level signal; per-tx readiness is resolved by the proof request
      // itself (which reports reorg-window / unknown-tx conditions).
      const outcome = await call(
        `/api/v1/attested-height/${ATTESTCOIN_CHAIN_KEY}`,
      );
      if (outcome.kind === "FAILED") {
        return { kind: "FAILED", failure: outcome.failure };
      }
      if (outcome.result.status !== 200) {
        return {
          kind: "FAILED",
          failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
        };
      }
      const body = outcome.result.body as { attestedHeight?: unknown } | null;
      const height = body?.attestedHeight;
      if (
        typeof height !== "number" ||
        !Number.isInteger(height) ||
        height < 0
      ) {
        return {
          kind: "FAILED",
          failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
        };
      }
      // Readiness is only meaningful against a specific tx block; the caller
      // supplies the claimed tx hash, so without a per-tx lookup here we
      // cannot assert the tx's own block is below the attested height. The
      // proof request path answers definitively; the cache signal alone means
      // attestation is running (never an authoritative per-tx answer).
      return {
        kind: "READINESS",
        readiness:
          height > 0
            ? { ready: true, blockHeight: String(height) }
            : { ready: false, reason: "NOT_ATTESTED_YET" },
      };
    },

    async requestProof(claimedTxHash) {
      const outcome = await call(
        `/api/v1/proof-by-tx/${ATTESTCOIN_CHAIN_KEY}/${claimedTxHash}`,
      );
      if (outcome.kind === "FAILED") {
        return { kind: "PROOF_BUILDER_FAILED", failure: outcome.failure };
      }
      if (outcome.result.status === 200) {
        const raw = outcome.result.body as Record<string, unknown> | null;
        if (
          raw === null ||
          typeof raw !== "object" ||
          !("txBytes" in raw && "headerNumber" in raw)
        ) {
          return {
            kind: "PROOF_BUILDER_FAILED",
            failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
          };
        }
        return { kind: "PROOF_RECEIVED", raw };
      }
      if (outcome.result.status === 404) {
        // Provider-side not-ready/not-provable answer: retryable condition,
        // never authoritative rejection of the source transaction.
        const body = outcome.result.body as RawProofBuilderErrorBody | null;
        const code = typeof body?.code === "string" ? body.code : "";
        const readiness: ProofReadiness =
          code === "BlockNotOnSourceChain" || code === "BlockNotAttested"
            ? { ready: false, reason: "NOT_ATTESTED_YET" }
            : { ready: false, reason: "UNKNOWN_TX" };
        return { kind: "PROOF_NOT_READY", readiness };
      }
      return {
        kind: "PROOF_BUILDER_FAILED",
        failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
      };
    },
  };
}
