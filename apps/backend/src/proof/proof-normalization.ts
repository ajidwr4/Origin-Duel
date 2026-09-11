import {
  type AttestcoinProofPayloadV1,
  AttestcoinProofPayloadV1Schema,
} from "@origin-duel/domain";

/**
 * Exact AttestcoinProofPayloadV1 normalization (Phase 10 §26/§57, Phase 12
 * §57 mirror). The raw vendor proof object is validated and converted here —
 * it never crosses the domain boundary raw. Sibling order and continuity-root
 * order are cryptographically meaningful and MUST NOT be reordered (no
 * sorting, ever). encodedTransaction is bounded to 65536 bytes by the domain
 * schema itself.
 */

export type ProofNormalizationError =
  | "MALFORMED_PROOF"
  | "OVERSIZED_ENCODED_TRANSACTION"
  | "INVALID_CHAIN_KEY"
  | "INVALID_BLOCK_HEIGHT"
  | "PROOF_BUILDER_UNAVAILABLE";

export type NormalizedProofOutcome =
  | { kind: "NORMALIZED"; payload: AttestcoinProofPayloadV1 }
  | { kind: "REJECTED"; error: ProofNormalizationError };

/** Vendor-side single-proof data shape observed from the hosted builder. */
export interface RawVendorProofData {
  headerNumber?: unknown;
  txBytes?: unknown;
  merkleProof?: unknown;
  continuityProof?: unknown;
}

/**
 * Maps the hosted Prover's raw proof fields onto the canonical
 * AttestcoinProofPayloadV1, then validates exactly.
 */
export function normalizeAttestcoinProof(raw: unknown): NormalizedProofOutcome {
  if (raw === null || typeof raw !== "object") {
    return { kind: "REJECTED", error: "MALFORMED_PROOF" };
  }
  const data = raw as RawVendorProofData;

  const chainKey = ATTESTCOIN_CHAIN_KEY_ONE;
  const blockHeight = toUint64Decimal(data.headerNumber);
  if (blockHeight === undefined) {
    return { kind: "REJECTED", error: "INVALID_BLOCK_HEIGHT" };
  }

  const encodedTransaction = toLowercaseEvenHex(data.txBytes);
  if (encodedTransaction === undefined) {
    return { kind: "REJECTED", error: "MALFORMED_PROOF" };
  }
  if ((encodedTransaction.length - 2) / 2 > 65_536) {
    return { kind: "REJECTED", error: "OVERSIZED_ENCODED_TRANSACTION" };
  }

  const merkle = data.merkleProof as
    | { root?: unknown; siblings?: unknown }
    | undefined;
  const merkleRoot = toBytes32Hex(merkle?.root);
  const siblings = toSiblingList(merkle?.siblings);
  if (merkleRoot === undefined || siblings === undefined) {
    return { kind: "REJECTED", error: "MALFORMED_PROOF" };
  }

  const continuity = data.continuityProof as
    | { lowerEndpointDigest?: unknown; roots?: unknown }
    | undefined;
  const lowerEndpointDigest = toBytes32Hex(continuity?.lowerEndpointDigest);
  const continuityRoots = toBytes32HexList(continuity?.roots);
  if (lowerEndpointDigest === undefined || continuityRoots === undefined) {
    return { kind: "REJECTED", error: "MALFORMED_PROOF" };
  }

  // Final exact schema validation: chainKey, uint64 decimal string,
  // lowercase even-length hex, bytes32 shapes, orders preserved as mapped.
  const candidate = {
    chainKey,
    blockHeight,
    encodedTransaction,
    merkleRoot,
    // Order-preserving mapping only — never sorted.
    siblings,
    lowerEndpointDigest,
    continuityRoots,
  };
  const parsed = AttestcoinProofPayloadV1Schema.safeParse(candidate);
  if (!parsed.success) {
    return { kind: "REJECTED", error: "MALFORMED_PROOF" };
  }
  return { kind: "NORMALIZED", payload: parsed.data };
}

const ATTESTCOIN_CHAIN_KEY_ONE = 1 as const;

function toUint64Decimal(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      return undefined;
    }
    return value.toString(10);
  }
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }
  return undefined;
}

const HEX_EVEN_LOWERCASE = /^0x[0-9a-f]*$/;

function toLowercaseEvenHex(value: unknown): `0x${string}` | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (!HEX_EVEN_LOWERCASE.test(normalized) || normalized.length % 2 !== 0) {
    return undefined;
  }
  return normalized as `0x${string}`;
}

const BYTES32 = /^0x[0-9a-f]{64}$/;

function toBytes32Hex(value: unknown): `0x${string}` | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (!BYTES32.test(normalized)) {
    return undefined;
  }
  return normalized as `0x${string}`;
}

function toSiblingList(
  value: unknown,
): Array<{ hash: `0x${string}`; isLeft: boolean }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const siblings: Array<{ hash: `0x${string}`; isLeft: boolean }> = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") {
      return undefined;
    }
    const e = entry as { hash?: unknown; isLeft?: unknown };
    const hash = toBytes32Hex(e.hash);
    if (hash === undefined || typeof e.isLeft !== "boolean") {
      return undefined;
    }
    siblings.push({ hash, isLeft: e.isLeft });
  }
  return siblings;
}

function toBytes32HexList(value: unknown): `0x${string}`[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const roots: `0x${string}`[] = [];
  for (const entry of value) {
    const root = toBytes32Hex(entry);
    if (root === undefined) {
      return undefined;
    }
    roots.push(root);
  }
  return roots;
}
