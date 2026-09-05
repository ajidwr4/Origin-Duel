import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  normalizeWalletAddress,
  parseBytes32HexV1,
  parseWalletAddress,
  serializeBytes32HexV1,
  serializeWalletAddress,
  tokenIdFromJson,
  tokenIdToJson,
  UINT256_MAX,
  weiAmountFromJson,
  weiAmountToJson,
} from "./index.js";

const lowerHexCharacter = fc.constantFrom(..."0123456789abcdef");
const mixedHexCharacter = fc.constantFrom(..."0123456789abcdefABCDEF");
const fixedHex = (character: fc.Arbitrary<string>, length: number) =>
  fc
    .array(character, { minLength: length, maxLength: length })
    .map((value) => value.join(""));

describe("canonical primitive properties", () => {
  it("round-trips every uint256 bigint through canonical tokenId JSON", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: UINT256_MAX }), (value) => {
        const serialized = tokenIdToJson(value);
        expect(serialized).toMatch(/^(0|[1-9][0-9]*)$/);
        expect(tokenIdFromJson(serialized)).toBe(value);
      }),
    );
  });

  it("round-trips every uint256 bigint through canonical wei JSON", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: UINT256_MAX }), (value) => {
        const serialized = weiAmountToJson(value);
        expect(serialized).toMatch(/^(0|[1-9][0-9]*)$/);
        expect(weiAmountFromJson(serialized)).toBe(value);
      }),
    );
  });

  it("round-trips canonical bytes32 values", () => {
    fc.assert(
      fc.property(fixedHex(lowerHexCharacter, 64), (hex) => {
        const value = parseBytes32HexV1(`0x${hex}`);
        expect(parseBytes32HexV1(serializeBytes32HexV1(value))).toBe(value);
      }),
    );
  });

  it("normalizes address casing idempotently", () => {
    fc.assert(
      fc.property(fixedHex(mixedHexCharacter, 40), (hex) => {
        const normalized = normalizeWalletAddress(`0x${hex}`);
        expect(normalizeWalletAddress(normalized)).toBe(normalized);
        expect(normalized).toMatch(/^0x[0-9a-f]{40}$/);
        expect(parseWalletAddress(serializeWalletAddress(normalized))).toBe(
          normalized,
        );
      }),
    );
  });
});
