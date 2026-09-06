import { describe, expect, it } from "vitest";
import { MONSTER_GENERATION_VECTORS_V1 } from "../../../test-fixtures/monster-generation/index.js";
import { FROZEN_TRANSACTION_DNA_V1 } from "../../../test-fixtures/transaction-dna/index.js";
import {
  DOMAIN_ELEMENT,
  DOMAIN_LEVEL,
  DOMAIN_RARITY,
  DOMAIN_SPECIES,
  DOMAIN_STAT_ALLOCATION,
} from "../constants/index.js";
import {
  deriveTransactionDnaV1,
  domainSampleV1,
  entropySeedFromDnaV1,
  type TransactionDNAV1,
} from "../transaction/index.js";
import { generateMonsterV1 } from "./index.js";

const domains = {
  level: DOMAIN_LEVEL,
  element: DOMAIN_ELEMENT,
  species: DOMAIN_SPECIES,
  rarity: DOMAIN_RARITY,
  statAllocation: DOMAIN_STAT_ALLOCATION,
} as const;

describe("GEN-01 TypeScript parity", () => {
  it("reproduces the source-owned TransactionDNA and named samples", () => {
    const fixture = FROZEN_TRANSACTION_DNA_V1;
    const result = deriveTransactionDnaV1({
      activityClass: fixture.input.activityClass,
      blockHeight: BigInt(fixture.input.blockHeight),
      transactionIndex: BigInt(fixture.input.transactionIndex),
    });

    expect(result).toEqual({
      entropyDigest: fixture.expectedEntropyDigest,
      entropyPayload: fixture.expectedEntropyPayload,
      transactionDNA: fixture.expectedTransactionDNA,
      entropySeed: fixture.expectedEntropySeed,
    });
    for (const [name, domain] of Object.entries(domains)) {
      expect(domainSampleV1(result.entropySeed, domain, 0n)).toBe(
        fixture.expectedSample0[name as keyof typeof fixture.expectedSample0],
      );
    }
  });

  it.each(MONSTER_GENERATION_VECTORS_V1)(
    "reproduces source-owned Vector $id exactly",
    (vector) => {
      const dna = vector.transactionDNA as TransactionDNAV1;
      const seed = entropySeedFromDnaV1(dna);
      for (const [name, domain] of Object.entries(domains)) {
        expect(domainSampleV1(seed, domain, 0n)).toBe(
          vector.sample0[name as keyof typeof vector.sample0],
        );
      }
      expect(generateMonsterV1(dna)).toEqual({
        speciesId: vector.expected.speciesId,
        level: vector.expected.level,
        atk: vector.expected.atk,
        def: vector.expected.def,
        element: vector.expected.element,
        rarity: vector.expected.rarity,
        transactionDNA: vector.transactionDNA,
      });
    },
  );
});
