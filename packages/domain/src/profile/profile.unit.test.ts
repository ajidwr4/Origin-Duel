import { describe, expect, it } from "vitest";
import {
  createPlayerProfileViewV1,
  PlayerProfileViewV1Schema,
} from "./index.js";

const ADDRESS = `0x${"11".repeat(20)}`;

describe("player profile V1", () => {
  it("uses the canonical missing-row logical default", () => {
    expect(createPlayerProfileViewV1(ADDRESS)).toEqual({
      walletAddress: ADDRESS,
      totalWins: 0,
      playerLevel: 1,
    });
  });

  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
  ])("derives level from %i total wins", (totalWins, playerLevel) => {
    expect(createPlayerProfileViewV1(ADDRESS, totalWins).playerLevel).toBe(
      playerLevel,
    );
  });

  it("rejects client-invented progression state", () => {
    expect(
      PlayerProfileViewV1Schema.safeParse({
        walletAddress: ADDRESS,
        totalWins: 5,
        playerLevel: 1,
      }).success,
    ).toBe(false);
    expect(
      PlayerProfileViewV1Schema.safeParse({
        walletAddress: ADDRESS,
        totalWins: 0,
        playerLevel: 1,
        xp: 1,
      }).success,
    ).toBe(false);
  });
});
