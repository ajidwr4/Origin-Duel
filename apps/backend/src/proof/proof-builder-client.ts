/**
 * Proof Builder transport client (Phase 9 §16, Attestcoin-Protocol Prover
 * Server). The hosted Prover endpoint (proof-by-tx/{chainKey}/{txHash} and
 * attestation-height readiness) is an untrusted, replaceable HTTP
 * dependency — never proof authority. Cryptographic verification lives in
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

/** Raw vendor proof envelope as observed from the hosted builder. */
export interface RawProofBuilderResponse {
  success?: boolean;
  error?: string;
  data?: unknown;
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

  async function call(
    path: string,
  ): Promise<
    | { kind: "OK"; body: unknown }
    | { kind: "FAILED"; failure: ProofBuilderFailure }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchFn(`${normalizedBase}${path}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          kind: "FAILED",
          failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
        };
      }
      const body: unknown = await response.json();
      return { kind: "OK", body };
    } catch (error) {
      const name = (error as { name?: string } | undefined)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        return { kind: "FAILED", failure: { kind: "PROOF_BUILDER_TIMEOUT" } };
      }
      // Network-level failure (fetch TypeError etc) or JSON parse failure.
      return { kind: "FAILED", failure: { kind: "PROOF_BUILDER_UNAVAILABLE" } };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async checkReadiness(_claimedTxHash) {
      // Hosted prover attestation-cache readiness probe: the documented
      // builder interface exposes height-attested state per chainKey, not
      // per transaction — readiness for a specific tx is resolved by the
      // proof request itself.
      const outcome = await call(`/attested-height/${ATTESTCOIN_CHAIN_KEY}`);
      if (outcome.kind === "FAILED") {
        return { kind: "FAILED", failure: outcome.failure };
      }
      const body = outcome.body as { data?: { blockHeight?: unknown } } | null;
      const height = body?.data?.blockHeight;
      if (typeof height !== "number" && typeof height !== "string") {
        return {
          kind: "FAILED",
          failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
        };
      }
      // The cache reports the highest attested source height; readiness for
      // a specific tx still needs the tx lookup, which requestProof owns.
      return {
        kind: "READINESS",
        readiness: { ready: false, reason: "NOT_ATTESTED_YET" },
      };
    },

    async requestProof(claimedTxHash) {
      const outcome = await call(
        `/proof-by-tx/${ATTESTCOIN_CHAIN_KEY}/${claimedTxHash}`,
      );
      if (outcome.kind === "FAILED") {
        return { kind: "PROOF_BUILDER_FAILED", failure: outcome.failure };
      }
      const envelope = outcome.body as RawProofBuilderResponse | null;
      if (
        envelope === null ||
        typeof envelope !== "object" ||
        envelope.success === undefined
      ) {
        return {
          kind: "PROOF_BUILDER_FAILED",
          failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
        };
      }
      if (!envelope.success) {
        // Provider-side not-ready/not-provable answer: retryable condition,
        // never authoritative rejection of the source transaction.
        const reasonText = String(envelope.error ?? "");
        const readiness: ProofReadiness = reasonText.includes("not attested")
          ? { ready: false, reason: "NOT_ATTESTED_YET" }
          : { ready: false, reason: "UNKNOWN_TX" };
        return { kind: "PROOF_NOT_READY", readiness };
      }
      return { kind: "PROOF_RECEIVED", raw: envelope.data };
    },
  };
}
