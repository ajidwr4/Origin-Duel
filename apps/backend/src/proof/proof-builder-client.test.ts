import { describe, expect, it } from "vitest";
import { createProofBuilderClient } from "./proof-builder-client.ts";

/**
 * M05-T03 Proof Builder transport evidence (post-correction: paths and
 * response shapes observed from the live hosted prover). Deterministic
 * scriptable fetch — no network. Timeout/unavailable/malformed remain
 * retryable dependency conditions; not-ready (HTTP 404 + provider error
 * code) stays WAITING; a 200 bare proof object passes through unverified.
 */

const TX_HASH = `0x${"12".repeat(32)}`;
const BASE_URL = "https://prover.example.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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
  it("uses the configured base URL and the observed live proof path", async () => {
    let seenUrl = "";
    const client = clientWith(async (input) => {
      seenUrl = input;
      return jsonResponse({ txBytes: "0x02", headerNumber: 5 });
    });
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome.kind).toBe("PROOF_RECEIVED");
    expect(seenUrl).toBe(
      `https://prover.example.test/api/v1/proof-by-tx/1/${TX_HASH}`,
    );
  });

  it("200 bare proof object passes the raw proof data unverified", async () => {
    const data = { headerNumber: 5, txBytes: "0x02", txIndex: 2 };
    const client = clientWith(async () => jsonResponse(data));
    const outcome = await client.requestProof(TX_HASH);
    if (outcome.kind !== "PROOF_RECEIVED") throw new Error("expected received");
    expect(outcome.raw).toEqual(data);
  });

  it("200 body without proof fields maps to PROOF_BUILDER_MALFORMED_RESPONSE", async () => {
    const client = clientWith(async () => jsonResponse({ nonsense: 1 }));
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
    });
  });

  it("404 BlockNotOnSourceChain stays WAITING (not-attested), never rejection", async () => {
    const client = clientWith(async () =>
      jsonResponse(
        {
          code: "BlockNotOnSourceChain",
          message: "within reorg-protection window",
          retriable: true,
        },
        404,
      ),
    );
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_NOT_READY",
      readiness: { ready: false, reason: "NOT_ATTESTED_YET" },
    });
  });

  it("404 TxHashNotFound stays WAITING (UNKNOWN_TX)", async () => {
    const client = clientWith(async () =>
      jsonResponse(
        {
          code: "TxHashNotFound",
          message: "tx hash not found",
          retriable: false,
        },
        404,
      ),
    );
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_NOT_READY",
      readiness: { ready: false, reason: "UNKNOWN_TX" },
    });
  });

  it("non-200/404 provider status maps to PROOF_BUILDER_UNAVAILABLE", async () => {
    const client = clientWith(async () => jsonResponse({}, 500));
    const outcome = await client.requestProof(TX_HASH);
    expect(outcome).toEqual({
      kind: "PROOF_BUILDER_FAILED",
      failure: { kind: "PROOF_BUILDER_UNAVAILABLE" },
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

  it("malformed JSON maps to PROOF_BUILDER_MALFORMED_RESPONSE on 200", async () => {
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
      failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
    });
  });

  it("readiness uses the observed live attested-height path and shape", async () => {
    let seenUrl = "";
    const client = clientWith(async (input) => {
      seenUrl = input;
      return jsonResponse({ attestedHeight: 11_679_220 });
    });
    const outcome = await client.checkReadiness(TX_HASH);
    expect(seenUrl).toBe(
      "https://prover.example.test/api/v1/attested-height/1",
    );
    if (outcome.kind !== "READINESS") throw new Error("expected readiness");
    expect(outcome.readiness).toEqual({
      ready: true,
      blockHeight: "11679220",
    });
  });

  it("attestedHeight 0 keeps readiness NOT_ATTESTED_YET", async () => {
    const client = clientWith(async () => jsonResponse({ attestedHeight: 0 }));
    const outcome = await client.checkReadiness(TX_HASH);
    if (outcome.kind !== "READINESS") throw new Error("expected readiness");
    expect(outcome.readiness).toEqual({
      ready: false,
      reason: "NOT_ATTESTED_YET",
    });
  });

  it("malformed readiness body maps to PROOF_BUILDER_MALFORMED_RESPONSE", async () => {
    const client = clientWith(async () => jsonResponse({ wrong: "shape" }));
    const outcome = await client.checkReadiness(TX_HASH);
    expect(outcome).toEqual({
      kind: "FAILED",
      failure: { kind: "PROOF_BUILDER_MALFORMED_RESPONSE" },
    });
  });
});
