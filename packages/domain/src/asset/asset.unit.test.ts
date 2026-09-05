import { describe, expect, it } from "vitest";
import {
  AssetAttemptStatusV1Schema,
  AssetAttemptViewV1Schema,
  CaptureMintStatusV1Schema,
  CaptureMintViewV1Schema,
  MintAcknowledgementRequestV1Schema,
} from "../index.js";

const HASH = `0x${"12".repeat(32)}`;

describe("asset and mint status separation", () => {
  it("preserves exact, disjoint status registries", () => {
    expect(AssetAttemptStatusV1Schema.options).toEqual([
      "MONSTER_RESOLVED",
      "IMAGE_UPLOADED",
      "ASSET_READY",
      "SUPERSEDED",
    ]);
    expect(CaptureMintStatusV1Schema.options).toEqual([
      "READY_TO_MINT",
      "WAITING_FOR_WALLET",
      "MINT_SUBMITTING",
      "RESULT_UNKNOWN",
      "CONFIRMED_FAILURE",
      "MINTED",
    ]);
    expect(AssetAttemptStatusV1Schema.safeParse("MINTED").success).toBe(false);
    expect(CaptureMintStatusV1Schema.safeParse("ASSET_READY").success).toBe(
      false,
    );
  });

  it("rejects status cross-contamination in resource views", () => {
    expect(
      AssetAttemptViewV1Schema.safeParse({
        attemptKey: HASH,
        status: "MINT_SUBMITTING",
        generationSpecVersion: 1,
        artSpecVersion: 1,
        metadataSpecVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      CaptureMintViewV1Schema.safeParse({
        status: "ASSET_READY",
        attemptKey: HASH,
      }).success,
    ).toBe(false);
  });

  it("accepts only the exact mint acknowledgement correlation tuple", () => {
    const acknowledgement = {
      sourceTx: HASH,
      attemptKey: HASH,
      mintTxHash: HASH,
    };
    expect(MintAcknowledgementRequestV1Schema.parse(acknowledgement)).toEqual(
      acknowledgement,
    );
    expect(
      MintAcknowledgementRequestV1Schema.safeParse({
        ...acknowledgement,
        mintSuccess: true,
      }).success,
    ).toBe(false);
  });
});
