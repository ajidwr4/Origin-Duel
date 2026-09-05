import { describe, expect, it } from "vitest";
import { DeckTokenIdsV1Schema, SaveDeckRequestV1Schema } from "./index.js";

const TOKEN_IDS = Array.from({ length: 15 }, (_, index) => String(index));

describe("deck V1 schemas", () => {
  it("preserves exact ordered 15-card input", () => {
    expect(SaveDeckRequestV1Schema.parse({ tokenIds: TOKEN_IDS })).toEqual({
      tokenIds: TOKEN_IDS,
    });
  });

  it("rejects invalid size, duplicates, noncanonical IDs, and unknown keys", () => {
    expect(DeckTokenIdsV1Schema.safeParse(TOKEN_IDS.slice(0, 14)).success).toBe(
      false,
    );
    expect(
      DeckTokenIdsV1Schema.safeParse([...TOKEN_IDS.slice(0, 14), "0"]).success,
    ).toBe(false);
    expect(
      DeckTokenIdsV1Schema.safeParse([...TOKEN_IDS.slice(0, 14), "01"]).success,
    ).toBe(false);
    expect(
      SaveDeckRequestV1Schema.safeParse({
        tokenIds: TOKEN_IDS,
        owner: "client",
      }).success,
    ).toBe(false);
  });
});
