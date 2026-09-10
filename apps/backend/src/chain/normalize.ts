import {
  type Bytes32HexV1,
  normalizeWalletAddress as normalizeWalletAddressImpl,
  type TokenIdJsonV1,
  tokenIdFromJson,
  tokenIdToJson,
  type WalletAddress,
} from "@origin-duel/domain";

/**
 * Bigint-safe normalization helpers for the chain layer (Phase 10 §57, PHASE
 * 12 §57 mirror). Canonical uint256/uint64 values are bigint internally and
 * decimal strings at JSON boundaries — a JavaScript `number` never
 * represents a canonical uint256 (CLAUDE.md §7).
 */

const UINT64_MAX = (1n << 64n) - 1n;
const HEX_EVEN_LOWERCASE = /^0x(?:[0-9a-f]{2})*$/;

/**
 * Normalizes any 0x-hex byte string to canonical lowercase even-length form.
 * Rejects odd-length nibbles, uppercase, missing 0x, and non-hex characters —
 * provider payloads are untrusted and must never cross the boundary malformed.
 */
export function normalizeHexBytes(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (!HEX_EVEN_LOWERCASE.test(trimmed)) {
    throw new Error("malformed hex bytes: expected 0x + lowercase even-length");
  }
  return trimmed as `0x${string}`;
}

/**
 * uint64-checked decimal string normalization. Throws on negative, empty,
 * non-canonical decimal (leading zeros), or > uint64 range.
 */
export function normalizeUint64Decimal(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`malformed uint64 decimal: ${JSON.stringify(value)}`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) {
    throw new Error(`uint64 out of range: ${value}`);
  }
  return value;
}

/** bigint -> decimal string at the JSON boundary. */
export function bigintValueToJson(value: bigint): string {
  if (value < 0n) {
    throw new Error(`negative canonical uint: ${value}`);
  }
  return value.toString(10);
}

/** Decimal-string -> bigint. Malformed numeric input is rejected, not coerced. */
export function bigintValueFromJson(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`malformed canonical decimal: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/** TokenId round-trip through the canonical domain helpers. */
export function tokenIdRoundTrip(value: bigint): TokenIdJsonV1 {
  return tokenIdToJson(tokenIdFromJson(bigintValueToJson(value)));
}

export const normalizeWalletAddress = normalizeWalletAddressImpl;

export type { Bytes32HexV1, TokenIdJsonV1, WalletAddress };
