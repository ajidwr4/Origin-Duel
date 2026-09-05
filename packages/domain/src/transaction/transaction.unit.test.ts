import { describe, expect, it } from "vitest";
import { UINT256_MAX } from "../primitives/index.js";
import {
  ClaimantModeV1Schema,
  NormalizedTxV1Schema,
  SourceProfileV1Schema,
  SourceTxV1Schema,
  TransactionDNAV1Schema,
  UINT64_MAX,
} from "./index.js";

const DNA = `0x03${"ab".repeat(31)}`;
const SOURCE_TX = `0x${"12".repeat(32)}`;

describe("transaction vocabulary", () => {
  it("validates canonical normalized transaction data without number coercion", () => {
    expect(
      NormalizedTxV1Schema.parse({
        activityClass: 3,
        blockHeight: 6_000_000n,
        transactionIndex: 42n,
      }),
    ).toEqual({
      activityClass: 3,
      blockHeight: 6_000_000n,
      transactionIndex: 42n,
    });
  });

  it.each([
    { activityClass: 6, blockHeight: 1n, transactionIndex: 0n },
    { activityClass: 1, blockHeight: UINT64_MAX + 1n, transactionIndex: 0n },
    { activityClass: 1, blockHeight: 1n, transactionIndex: UINT256_MAX + 1n },
    { activityClass: 1, blockHeight: 1, transactionIndex: 0n },
    { activityClass: 1, blockHeight: 1n, transactionIndex: 0n, value: 1n },
  ])("rejects invalid normalized transaction data", (value) => {
    expect(NormalizedTxV1Schema.safeParse(value).success).toBe(false);
  });

  it("keeps DNA and provenance as distinct bytes32 boundaries", () => {
    expect(TransactionDNAV1Schema.parse(DNA)).toBe(DNA);
    expect(SourceTxV1Schema.parse(SOURCE_TX)).toBe(SOURCE_TX);
    expect(SourceTxV1Schema.safeParse(`0x${"00".repeat(32)}`).success).toBe(
      false,
    );
  });

  it("preserves exact profile and claimant-mode vocabulary", () => {
    expect(
      SourceProfileV1Schema.parse("EIP1559_TYPE2_EMPTY_ACCESS_LIST_V1"),
    ).toBe("EIP1559_TYPE2_EMPTY_ACCESS_LIST_V1");
    expect(ClaimantModeV1Schema.parse("DIRECT_TX_SENDER")).toBe(
      "DIRECT_TX_SENDER",
    );
  });
});
