import { describe, expect, it } from "vitest";
import { GeneratedMonsterV1Schema, ResolvedMonsterV1Schema } from "./index.js";

const transactionDNA = `0x03${"ab".repeat(31)}`;
const sourceTx = `0x${"12".repeat(32)}`;

const normalMonster = {
  speciesId: 7,
  level: 3,
  atk: 800,
  def: 1_200,
  element: "WIND",
  rarity: "RARE",
  transactionDNA,
} as const;

describe("Monster V1 structural schemas", () => {
  it("accepts canonical generated and resolved Monsters", () => {
    expect(GeneratedMonsterV1Schema.parse(normalMonster)).toEqual(
      normalMonster,
    );
    expect(
      ResolvedMonsterV1Schema.parse({ ...normalMonster, sourceTx }),
    ).toEqual({ ...normalMonster, sourceTx });
    expect(
      GeneratedMonsterV1Schema.safeParse({
        ...normalMonster,
        level: 6,
        atk: 1_560,
        def: 1_040,
      }).success,
    ).toBe(true);
  });

  it.each([
    { speciesId: 0 },
    { speciesId: 13 },
    { level: 0 },
    { level: 7 },
    { atk: 799, def: 1_201 },
    { atk: 1_561, def: 439 },
    { element: "EARTH" },
    { rarity: "MYTHIC" },
    { transactionDNA: `0x${"ab".repeat(31)}` },
    { atk: 1_000, def: 999 },
    { level: 4, atk: 1_200, def: 800 },
    { extra: true },
  ])("rejects invalid generated Monster state", (patch) => {
    expect(
      GeneratedMonsterV1Schema.safeParse({ ...normalMonster, ...patch })
        .success,
    ).toBe(false);
  });

  it("requires a non-zero sourceTx only on resolved Monsters", () => {
    expect("sourceTx" in GeneratedMonsterV1Schema.parse(normalMonster)).toBe(
      false,
    );
    expect(
      ResolvedMonsterV1Schema.safeParse({
        ...normalMonster,
        sourceTx: `0x${"00".repeat(32)}`,
      }).success,
    ).toBe(false);
    expect(
      GeneratedMonsterV1Schema.safeParse({ ...normalMonster, sourceTx })
        .success,
    ).toBe(false);
  });
});
