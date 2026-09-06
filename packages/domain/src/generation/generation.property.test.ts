import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateMonsterV1 } from "./index.js";

const DNA_PAYLOAD_MAX = (1n << 248n) - 1n;

describe("Monster Generator V1 properties", () => {
  it("preserves deterministic bounds and exact power conservation", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.bigInt({ min: 0n, max: DNA_PAYLOAD_MAX }),
        (activityClass, payload) => {
          const dna = `0x${activityClass.toString(16).padStart(2, "0")}${payload
            .toString(16)
            .padStart(62, "0")}` as const;
          const monster = generateMonsterV1(dna);
          expect(generateMonsterV1(dna)).toEqual(monster);
          expect(monster.level).toBeGreaterThanOrEqual(1);
          expect(monster.level).toBeLessThanOrEqual(6);
          expect(monster.speciesId).toBeGreaterThanOrEqual(
            activityClass * 2 + 1,
          );
          expect(monster.speciesId).toBeLessThanOrEqual(activityClass * 2 + 2);
          expect(monster.atk).toBeGreaterThanOrEqual(800);
          expect(monster.atk).toBeLessThanOrEqual(1_560);
          expect(monster.def).toBeGreaterThanOrEqual(800);
          expect(monster.def).toBeLessThanOrEqual(1_560);
          expect(monster.atk + monster.def).toBe(
            monster.level <= 3 ? 2_000 : 2_600,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("isolates activityClass to the species family", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: DNA_PAYLOAD_MAX }), (payload) => {
        const outputs = Array.from({ length: 6 }, (_, activityClass) =>
          generateMonsterV1(
            `0x${activityClass.toString(16).padStart(2, "0")}${payload
              .toString(16)
              .padStart(62, "0")}`,
          ),
        );
        const first = outputs[0];
        for (const monster of outputs.slice(1)) {
          expect({
            ...monster,
            speciesId: first?.speciesId,
            transactionDNA: first?.transactionDNA,
          }).toEqual(first);
        }
      }),
      { numRuns: 100 },
    );
  });
});
