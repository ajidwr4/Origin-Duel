import { describe, expect, it } from "vitest";
import { MONSTER_GENERATION_VECTORS_V1 } from "../../../test-fixtures/monster-generation/index.js";
import {
  DOMAIN_ELEMENT,
  DOMAIN_LEVEL,
  DOMAIN_RARITY,
  DOMAIN_SPECIES,
  DOMAIN_STAT_ALLOCATION,
} from "../constants/index.js";
import {
  domainSampleV1,
  entropySeedFromDnaV1,
  type TransactionDNAV1,
} from "../transaction/index.js";
import {
  GenerationSamplingExhausted,
  generateMonsterV1,
  resolveMonsterV1,
  uniformBelowV1,
} from "./index.js";

const domains = {
  level: DOMAIN_LEVEL,
  element: DOMAIN_ELEMENT,
  species: DOMAIN_SPECIES,
  rarity: DOMAIN_RARITY,
  statAllocation: DOMAIN_STAT_ALLOCATION,
} as const;

describe("Monster Generator V1", () => {
  it.each(MONSTER_GENERATION_VECTORS_V1)(
    "reproduces source-owned Vector $id",
    (vector) => {
      const dna = vector.transactionDNA as TransactionDNAV1;
      const entropySeed = entropySeedFromDnaV1(dna);
      for (const [name, domain] of Object.entries(domains)) {
        expect(domainSampleV1(entropySeed, domain, 0n)).toBe(
          vector.sample0[name],
        );
      }
      const monster = generateMonsterV1(dna);
      expect(monster).toEqual({
        speciesId: vector.expected.speciesId,
        level: vector.expected.level,
        atk: vector.expected.atk,
        def: vector.expected.def,
        element: vector.expected.element,
        rarity: vector.expected.rarity,
        transactionDNA: vector.transactionDNA,
      });
      expect(Number(uniformBelowV1(entropySeed, DOMAIN_LEVEL, 12n))).toBe(
        vector.expected.levelRoll,
      );
      expect(
        Number(uniformBelowV1(entropySeed, DOMAIN_STAT_ALLOCATION, 3n)),
      ).toBe(vector.expected.profileRoll);
      expect(Number(uniformBelowV1(entropySeed, DOMAIN_RARITY, 100n))).toBe(
        vector.expected.rarityRoll,
      );
      expect(Number(uniformBelowV1(entropySeed, DOMAIN_ELEMENT, 3n))).toBe(
        vector.expected.elementRoll,
      );
      expect(Number(uniformBelowV1(entropySeed, DOMAIN_SPECIES, 2n))).toBe(
        vector.expected.speciesChoice,
      );
    },
  );

  it("uses bounded unbiased rejection and fails closed on exhaustion", () => {
    const seed = `0x${"00".repeat(32)}` as const;
    let attempts = 0;
    expect(
      uniformBelowV1(seed, DOMAIN_LEVEL, 10n, () => {
        attempts += 1;
        return attempts === 1
          ? (`0x${"00".repeat(32)}` as const)
          : (`0x${"00".repeat(31)}0a` as const);
      }),
    ).toBe(0n);
    expect(attempts).toBe(2);
    expect(() =>
      uniformBelowV1(seed, DOMAIN_LEVEL, 10n, () => `0x${"00".repeat(32)}`),
    ).toThrow(GenerationSamplingExhausted);
    expect(() => uniformBelowV1(seed, DOMAIN_LEVEL, 0n)).toThrow(
      "n out of range",
    );
  });

  it("rejects an invalid activity family and accepts zero entropy", () => {
    expect(() => generateMonsterV1(`0x06${"00".repeat(31)}`)).toThrow(
      "activityClass out of range",
    );
    expect(generateMonsterV1(`0x${"00".repeat(32)}`)).toMatchObject({
      speciesId: expect.any(Number),
      transactionDNA: `0x${"00".repeat(32)}`,
    });
  });

  it("assembles provenance outside pure generation", () => {
    const generated = generateMonsterV1(
      MONSTER_GENERATION_VECTORS_V1[0]?.transactionDNA as TransactionDNAV1,
    );
    const sourceTx = `0x${"12".repeat(32)}` as const;
    expect(resolveMonsterV1(generated, sourceTx)).toEqual({
      ...generated,
      sourceTx,
    });
    expect(generateMonsterV1(generated.transactionDNA)).toEqual(generated);
  });
});
