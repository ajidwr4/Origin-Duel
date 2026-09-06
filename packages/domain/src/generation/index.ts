import {
  BALANCED_ATK_BPS,
  BPS_DENOMINATOR,
  DEFENSIVE_ATK_BPS,
  DOMAIN_ELEMENT,
  DOMAIN_LEVEL,
  DOMAIN_RARITY,
  DOMAIN_SPECIES,
  DOMAIN_STAT_ALLOCATION,
  Element,
  type ElementV1,
  MAX_REJECTION_ATTEMPTS,
  NORMAL_POWER_BUDGET,
  OFFENSIVE_ATK_BPS,
  Rarity,
  type RarityV1,
  type SpeciesIdV1,
  TRIBUTE_POWER_BUDGET,
} from "../constants/index.js";
import {
  type GeneratedMonsterV1,
  GeneratedMonsterV1Schema,
  type ResolvedMonsterV1,
  ResolvedMonsterV1Schema,
} from "../monster/index.js";
import { type Bytes32HexV1, UINT256_MAX } from "../primitives/index.js";
import {
  activityClassFromDnaV1,
  domainSampleV1,
  entropySeedFromDnaV1,
  type SourceTxV1,
  type TransactionDNAV1,
} from "../transaction/index.js";

export class GenerationSamplingExhausted extends Error {
  readonly domainId: Bytes32HexV1;

  constructor(domainId: Bytes32HexV1) {
    super(`generation sampling exhausted for ${domainId}`);
    this.name = "GenerationSamplingExhausted";
    this.domainId = domainId;
  }
}

export type DomainSamplerV1 = (
  entropySeed: Bytes32HexV1,
  domainId: Bytes32HexV1,
  sampleIndex: bigint,
) => Bytes32HexV1;

export function uniformBelowV1(
  entropySeed: Bytes32HexV1,
  domainId: Bytes32HexV1,
  n: bigint,
  sampler: DomainSamplerV1 = domainSampleV1,
): bigint {
  if (n <= 0n || n > UINT256_MAX) throw new RangeError("n out of range");
  const threshold = (UINT256_MAX - n + 1n) % n;
  for (let index = 0; index < MAX_REJECTION_ATTEMPTS; index += 1) {
    const sample = BigInt(sampler(entropySeed, domainId, BigInt(index)));
    if (sample >= threshold) return sample % n;
  }
  throw new GenerationSamplingExhausted(domainId);
}

function resolveLevel(roll: number): number {
  if (roll <= 2) return 1;
  if (roll <= 5) return 2;
  if (roll <= 8) return 3;
  if (roll === 9) return 4;
  if (roll === 10) return 5;
  return 6;
}

function resolveRarity(roll: number): RarityV1 {
  if (roll < 55) return Rarity.COMMON;
  if (roll < 80) return Rarity.RARE;
  if (roll < 95) return Rarity.EPIC;
  return Rarity.LEGENDARY;
}

const ELEMENT_NAMES = ["FIRE", "WATER", "WIND"] as const;
const RARITY_NAMES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export function generateMonsterV1(
  transactionDNA: TransactionDNAV1,
): GeneratedMonsterV1 {
  const activityClass = activityClassFromDnaV1(transactionDNA);
  const entropySeed = entropySeedFromDnaV1(transactionDNA);

  const level = resolveLevel(
    Number(uniformBelowV1(entropySeed, DOMAIN_LEVEL, 12n)),
  );
  const powerBudget = level <= 3 ? NORMAL_POWER_BUDGET : TRIBUTE_POWER_BUDGET;
  const profile = Number(
    uniformBelowV1(entropySeed, DOMAIN_STAT_ALLOCATION, 3n),
  );
  const atkBps =
    profile === 0
      ? OFFENSIVE_ATK_BPS
      : profile === 1
        ? BALANCED_ATK_BPS
        : DEFENSIVE_ATK_BPS;
  const atk = Math.floor((powerBudget * atkBps) / BPS_DENOMINATOR);
  const rarity = resolveRarity(
    Number(uniformBelowV1(entropySeed, DOMAIN_RARITY, 100n)),
  );
  const element = Number(
    uniformBelowV1(entropySeed, DOMAIN_ELEMENT, 3n),
  ) as ElementV1;
  const speciesId = (activityClass * 2 +
    Number(uniformBelowV1(entropySeed, DOMAIN_SPECIES, 2n)) +
    1) as SpeciesIdV1;

  return GeneratedMonsterV1Schema.parse({
    speciesId,
    level,
    atk,
    def: powerBudget - atk,
    element: ELEMENT_NAMES[element],
    rarity: RARITY_NAMES[rarity],
    transactionDNA,
  });
}

export function resolveMonsterV1(
  generated: GeneratedMonsterV1,
  sourceTx: SourceTxV1,
): ResolvedMonsterV1 {
  return ResolvedMonsterV1Schema.parse({ ...generated, sourceTx });
}

export { Element, Rarity };
