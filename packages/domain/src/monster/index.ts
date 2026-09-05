import { z } from "zod";
import {
  ElementJsonV1Schema,
  MAX_MONSTER_STAT,
  MIN_MONSTER_STAT,
  RarityJsonV1Schema,
  SpeciesIdV1Schema,
} from "../constants/index.js";
import {
  SourceTxV1Schema,
  TransactionDNAV1Schema,
} from "../transaction/index.js";

const MonsterLevelV1Schema = z.number().int().min(1).max(6);
const MonsterStatV1Schema = z
  .number()
  .int()
  .min(MIN_MONSTER_STAT)
  .max(MAX_MONSTER_STAT);

const generatedMonsterShape = {
  speciesId: SpeciesIdV1Schema,
  level: MonsterLevelV1Schema,
  atk: MonsterStatV1Schema,
  def: MonsterStatV1Schema,
  element: ElementJsonV1Schema,
  rarity: RarityJsonV1Schema,
  transactionDNA: TransactionDNAV1Schema,
} as const;

function hasCanonicalPowerBudget(monster: {
  level: number;
  atk: number;
  def: number;
}) {
  return monster.atk + monster.def === (monster.level <= 3 ? 2_000 : 2_600);
}

export const GeneratedMonsterV1Schema = z
  .strictObject(generatedMonsterShape)
  .refine(hasCanonicalPowerBudget, { message: "invalid power budget" });

export const ResolvedMonsterV1Schema = z
  .strictObject({ ...generatedMonsterShape, sourceTx: SourceTxV1Schema })
  .refine(hasCanonicalPowerBudget, { message: "invalid power budget" });

export type GeneratedMonsterV1 = z.infer<typeof GeneratedMonsterV1Schema>;
export type ResolvedMonsterV1 = z.infer<typeof ResolvedMonsterV1Schema>;
