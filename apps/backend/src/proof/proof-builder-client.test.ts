import { describe, expect, it } from "vitest";
import { createProofBuilderClient } from "./proof-builder-client.ts";

/**
 * M05-T03 Proof Builder transport evidence: deterministic scriptable fetch
 * (no network). Timeout/unavailable/malformed remain retryable dependency
 * conditions; not-ready stays WAITING; success passes only raw data onward.
 */

const TX_HASH = `0x${"12".repeat(32)}`;
const BASE_URL = "https://prover.example.test";

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(
  handler: (input: string, init?: RequestInit) => Promise<Response>,
  timeoutMs = 5_000,
) {
  return createProofBuilderClient(BASE_URL, handler, timeoutMs);
}

function fetchingError(name: string): never {
  const error = new Error("boom");
  error.name = name;
  throw error;
}

describe("proof builder client", () => {
  it("uses the configured base URL and documented proof-by-tx path", async () => {
    let seenUrl = "";
    const client = clientWith(async (input) => {
      seenUrl = input;
      return jsonResponse({ success: true, data: { proof: "shape" } });
    });
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome.kind).toBe("PROOF_RECEIVED");
    expect(seenUrl).toBe(
      `https://prover.example.test/proof-by-tx/1/${TX_HASH}`,
    );
  });

  it("success envelope returns the raw proof data unverified", async () => {
    const data = { headerNumber: 5, txBytes: "0x02" };
    const client = clientWith(async () =>
      jsonResponse({ success: true, data, cached: true }),
    );
    const outcome = await client.requestProof(TX_HASH);
    if (outcome.kind !== "PROOF_RECEIVED") throw new Error("expected received");
    expect(outcome.raw).toEqual(data);
  });

  it("provider not-ready stays WAITING (not-ready), never rejection", async () => {
    const client = clientWith(async () =>
      jsonResponse({ success: false, error: "block not attested yet" }),
    );
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_NOT_READY",
      readiness: { ready: false, reason: "NOT_ATTESTED_YET" },
    });
  });

  it("unknown transaction stays WAITING (UNKNOWN_TX)", async () => {
    const client = clientWith(async () =>
      jsonResponse({ success: false, error: "tx unknown" }),
    );
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_NOT_READY",
      readiness: { ready: false, reason: "UNKNOWN_TX" },
    });
  });

  it("timeout aborts to PROOF_BUILDER_TIMEOUT (retryable)", async () => {
    const client = clientWith(async () => fetchingError("AbortError"), 1);
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_TIMEOUT" },
    });
  });

  it("network failure maps to PROOF_BUILDER_UNAVAILABLE (retryable)", async () => {
    const client = clientWith(async () => fetchingError("TypeError"));
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
    });
  });

  it("HTTP error status maps to PROOF_BUILDER_UNAVAILABLE", async () => {
    const client = clientWith(async () => jsonResponse({}, false));
    const outcome = await client.requestProof(TX_HASH);
    expect(outkind(outcome)).toBe("PROOF_BUILDER_UNAVAILABLE");
  });

  it("malformed JSON maps to PROOF_BUILDER_UNAVAILABLE", async () => {
    const client = clientWith(
      async () =>
        new Response("not json at all", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
    });
  });

  it("non-envelope body maps to PROOF_BUILDER_MALFORMED_RESPONSE", async () => {
    const client = clientWith(async () => jsonResponse({ nonsense: 1 }));
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
    });
  });
});

function outkind(outcome: { failure?: { kind?: string } }): string | undefined {
  return outcome.failure?.kind;
}
