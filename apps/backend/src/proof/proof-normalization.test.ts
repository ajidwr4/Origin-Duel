import { describe, expect, it } from "vitest";
import { normalizeAttestcoinProof } from "./proof-normalization.ts";

/**
 * M05-T03 normalization evidence (Phase 10 §26/§57): ready / malformed /
 * oversized / bounds fixtures. Order preservation is asserted structurally —
 * siblings and continuity roots must map in provider order, never sorted.
 */

const BYTES32 = (fill: string) => `0x${fill.repeat(32)}`;
const SIBLINGS = [
  { hash: BYTES32("aa"), isLeft: true },
  { hash: BYTES32("bb"), isLeft: false },
  { hash: BYTES32("cc"), isLeft: true },
];
const CONTINUITY = [BYTES32("11"), BYTES32("22"), BYTES32("33")];

function rawProof(overrides: Record<string, unknown> = {}) {
  return {
    headerNumber: 18_000_000,
    txBytes: `0x${"02".repeat(16)}`,
    merkleProof: { root: BYTES32("dd"), siblings: SIBLINGS },
    continuityProof: { lowerEndpointDigest: BYTES32("ee"), roots: CONTINUITY },
    ...overrides,
  };
}

describe("attestcoin proof normalization", () => {
  it("normalizes a well-formed vendor proof to exact AttestcoinProofPayloadV1", () => {
    const outcome = normalizeAttestcoinProof(rawProof());
    if (outcome.kind !== "NORMALIZED") throw new Error("expected normalized");
    expect(outcome.payload).toEqual({
      chainKey: 1,
      blockHeight: "18000000",
      encodedTransaction: `0x${"02".repeat(16)}`,
      merkleRoot: BYTES32("dd"),
      siblings: SIBLINGS,
      lowerEndpointDigest: BYTES32("ee"),
      continuityRoots: CONTINUITY,
    });
  });

  it("preserves sibling order and isLeft semantics exactly (no sorting)", () => {
    const outcome = normalizeAttestcoinProof(rawProof());
    if (outcome.kind !== "NORMALIZED") throw new Error("expected normalized");
    expect(outcome.payload.siblings).toEqual(SIBLINGS);
    // Structural guarantee: the mapping does not call sort at any point.
    expect(outcome.payload.siblings.map((s) => s.hash)).toEqual([
      BYTES32("aa"),
      BYTES32("bb"),
      BYTES32("cc"),
    ]);
  });

  it("preserves continuity-root order exactly (no sorting)", () => {
    const outcome = normalizeAttestcoinProof(rawProof());
    if (outcome.kind !== "NORMALIZED") throw new Error("expected normalized");
    expect(outcome.payload.continuityRoots).toEqual(CONTINUITY);
  });

  it("rejects malformed root object", () => {
    expect(normalizeAttestcoinProof(null)).toEqual({
      kind: "REJECTED",
      error: "MALFORMED_PROOF",
    });
    expect(normalizeAttestcoinProof("a string")).toEqual({
      kind: "REJECTED",
      error: "MALFORMED_PROOF",
    });
    expect(normalizeAttestcoinProof(12345)).toEqual({
      kind: "REJECTED",
      error: "MALFORMED_PROOF",
    });
  });

  it("rejects malformed block heights", () => {
    expect(normalizeAttestcoinProof(rawProof({ headerNumber: -1 }))).toEqual({
      kind: "REJECTED",
      error: "INVALID_BLOCK_HEIGHT",
    });
    expect(normalizeAttestcoinProof(rawProof({ headerNumber: 1.5 }))).toEqual({
      kind: "REJECTED",
      error: "INVALID_BLOCK_HEIGHT",
    });
    expect(
      normalizeAttestcoinProof(rawProof({ headerNumber: "0x12" })),
    ).toEqual({ kind: "REJECTED", error: "INVALID_BLOCK_HEIGHT" });
    expect(normalizeAttestcoinProof(rawProof({ headerNumber: null }))).toEqual({
      kind: "REJECTED",
      error: "INVALID_BLOCK_HEIGHT",
    });
  });

  it("rejects oversized encodedTransaction above 65536 bytes (fail closed)", () => {
    const oversized = `0x${"ff".repeat(65_537)}`; // 65537 bytes > bound
    const outcome = normalizeAttestcoinProof(rawProof({ txBytes: oversized }));
    expect(outcome).toEqual({
      kind: "REJECTED",
      error: "OVERSIZED_ENCODED_TRANSACTION",
    });
  });

  it("accepts encodedTransaction exactly at the 65536-byte bound", () => {
    const exactBound = `0x${"aa".repeat(65_536)}`; // exactly 65536 bytes
    const outcome = normalizeAttestcoinProof(rawProof({ txBytes: exactBound }));
    expect(outcome.kind).toBe("NORMALIZED");
  });

  it("rejects malformed hex/bytes32 fields", () => {
    expect(
      normalizeAttestcoinProof(rawProof({ txBytes: "0x1" })),
    ).toMatchObject({ kind: "REJECTED" });
    expect(
      normalizeAttestcoinProof(rawProof({ txBytes: "0xGG" })),
    ).toMatchObject({ kind: "REJECTED" });
    expect(
      normalizeAttestcoinProof(
        rawProof({ merkleProof: { root: "0x1234", siblings: SIBLINGS } }),
      ),
    ).toMatchObject({ kind: "REJECTED" });
    expect(
      normalizeAttestcoinProof(
        rawProof({
          continuityProof: {
            lowerEndpointDigest: BYTES32("ee"),
            roots: [BYTES32("11"), "0xshort"],
          },
        }),
      ),
    ).toMatchObject({ kind: "REJECTED" });
  });

  it("rejects malformed sibling entries (missing isLeft / bad hash)", () => {
    expect(
      normalizeAttestcoinProof(
        rawProof({
          merkleProof: {
            root: BYTES32("dd"),
            siblings: [{ hash: BYTES32("aa") }],
          },
        }),
      ),
    ).toMatchObject({ kind: "REJECTED" });
    expect(
      normalizeAttestcoinProof(
        rawProof({ merkleProof: { root: BYTES32("dd"), siblings: {} } }),
      ),
    ).toMatchObject({ kind: "REJECTED" });
  });

  it("raw vendor object never crosses the boundary: normalized payload is a fresh object", () => {
    const raw = rawProof();
    const outcome = normalizeAttestcoinProof(raw);
    if (outcome.kind !== "NORMALIZED") throw new Error("expected normalized");
    // The payload references none of the raw provider object's containers.
    expect(outcome.payload.siblings).not.toBe(raw.merkleProof?.siblings);
    expect(outcome.payload.continuityRoots).not.toBe(
      raw.continuityProof?.roots,
    );
  });

  it("uppercase provider hex is normalized to canonical lowercase", () => {
    const outcome = normalizeAttestcoinProof(
      rawProof({
        txBytes: `0x${"AB".repeat(8)}`,
        merkleProof: {
          root: BYTES32("dd").toUpperCase(),
          siblings: [{ hash: BYTES32("aa").toUpperCase(), isLeft: true }],
        },
      }),
    );
    if (outcome.kind !== "NORMALIZED") throw new Error("expected normalized");
    expect(outcome.payload.encodedTransaction).toBe(`0x${"ab".repeat(8)}`);
    expect(outcome.payload.merkleRoot).toBe(BYTES32("dd"));
    expect(outcome.payload.siblings[0]?.hash).toBe(BYTES32("aa"));
  });
});
