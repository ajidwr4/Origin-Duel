import type { ResolvedMonsterV1 } from "@origin-duel/domain";

export interface MonsterGenerationExpectedV1 {
  readonly levelRoll: number;
  readonly level: number;
  readonly band: "NORMAL" | "TRIBUTE";
  readonly powerBudget: number;
  readonly profileRoll: number;
  readonly profile: "OFFENSIVE" | "BALANCED" | "DEFENSIVE";
  readonly atk: number;
  readonly def: number;
  readonly rarityRoll: number;
  readonly rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  readonly elementRoll: number;
  readonly element: "FIRE" | "WATER" | "WIND";
  readonly speciesChoice: number;
  readonly speciesId: number;
  readonly speciesCode: string;
}

export interface MonsterGenerationVectorV1 {
  readonly id: "A" | "B" | "C";
  readonly transactionDNA: `0x${string}`;
  readonly activityClass: number;
  readonly entropySeed?: `0x${string}`;
  readonly sample0: Readonly<Record<string, `0x${string}`>>;
  readonly expected: MonsterGenerationExpectedV1;
}

export declare const MONSTER_GENERATION_VECTORS_V1: readonly MonsterGenerationVectorV1[];
export declare const CROSS_LAYER_MONSTER_V1: ResolvedMonsterV1;
export declare const PROFILE_DEFAULT_V1: Readonly<{
  databaseRowExists: false;
  expectedApi: Readonly<{ totalWins: 0; playerLevel: 1 }>;
}>;
export declare const MATCH_START_IDEMPOTENCY_V1: Readonly<{
  human: `0x${string}`;
  startRequestId: string;
  expected: Readonly<{
    duplicateReturnsSameMatchId: true;
    duplicateReturnsSamePersistedMatchSeed: true;
  }>;
}>;
export declare function parseMonsterGenerationVectorsV1(
  value: unknown,
): readonly MonsterGenerationVectorV1[];
