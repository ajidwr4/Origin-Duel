import { z } from "zod";
import {
  ActionIndexV1Schema,
  CardInstanceIdV1Schema,
  MatchVersionV1Schema,
  NonNegativeIntegerV1Schema,
  PositiveIntegerV1Schema,
} from "../api/scalars.js";
import {
  ElementJsonV1Schema,
  RarityJsonV1Schema,
  SpeciesIdV1Schema,
} from "../constants/index.js";
import { TokenIdJsonV1Schema, UuidV1Schema } from "../primitives/index.js";

export const MatchStatusV1Schema = z.enum([
  "MATCH_CREATED",
  "SETUP_SHUFFLE_DRAW",
  "SETUP_MULLIGAN",
  "MATCH_READY",
  "MATCH_ACTIVE",
  "MATCH_FINISHED",
  "CANCELLED",
]);
export const BattlePhaseV1Schema = z.enum(["DRAW", "MAIN", "BATTLE", "END"]);
export const PlayerSlotV1Schema = z.enum(["PLAYER_1", "PLAYER_2"]);
export const WinnerSlotV1Schema = PlayerSlotV1Schema;
export const CardPositionV1Schema = z.enum(["ATK", "DEF"]);

export const BattleCardSnapshotV1Schema = z.strictObject({
  cardInstanceId: CardInstanceIdV1Schema,
  level: z.number().int().min(1).max(6),
  baseAtk: z.number().int().min(800).max(1_560),
  baseDef: z.number().int().min(800).max(1_560),
  element: ElementJsonV1Schema,
});

export const HumanInitialDeckEntryV1Schema = BattleCardSnapshotV1Schema.extend({
  cardInstanceId: z.number().int().min(1).max(15),
  tokenId: TokenIdJsonV1Schema,
  speciesId: SpeciesIdV1Schema,
  rarity: RarityJsonV1Schema,
});
export const BotInitialDeckEntryV1Schema = BattleCardSnapshotV1Schema.extend({
  cardInstanceId: z.number().int().min(16).max(30),
  systemCardId: z.string().min(1),
  speciesId: SpeciesIdV1Schema,
  rarity: RarityJsonV1Schema,
});
export const HumanInitialDeckSnapshotV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    cards: z.array(HumanInitialDeckEntryV1Schema).length(15),
  })
  .refine(
    ({ cards }) =>
      cards.every((card, index) => card.cardInstanceId === index + 1),
    { message: "Human cardInstanceId must match initial snapshot position" },
  );
export const BotInitialDeckSnapshotV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    cards: z.array(BotInitialDeckEntryV1Schema).length(15),
  })
  .refine(
    ({ cards }) =>
      cards.every((card, index) => card.cardInstanceId === index + 16),
    { message: "Bot cardInstanceId must match initial snapshot position" },
  );

const EmptyObjectV1Schema = z.strictObject({});
const SummonActionV1Schema = z.strictObject({
  type: z.literal("SUMMON"),
  payload: z.strictObject({
    cardInstanceId: CardInstanceIdV1Schema,
    initialPosition: CardPositionV1Schema,
  }),
});
const TributeSummonActionV1Schema = z.strictObject({
  type: z.literal("TRIBUTE_SUMMON"),
  payload: z.strictObject({
    cardInstanceId: CardInstanceIdV1Schema,
    tributeCardInstanceId: CardInstanceIdV1Schema,
    initialPosition: CardPositionV1Schema,
  }),
});
const ChangePositionActionV1Schema = z.strictObject({
  type: z.literal("CHANGE_POSITION"),
  payload: z.strictObject({ cardInstanceId: CardInstanceIdV1Schema }),
});
const EndMainActionV1Schema = z.strictObject({
  type: z.literal("END_MAIN"),
  payload: EmptyObjectV1Schema,
});
const DeclareAttackActionV1Schema = z.strictObject({
  type: z.literal("DECLARE_ATTACK"),
  payload: z.strictObject({
    attackerCardInstanceId: CardInstanceIdV1Schema,
    target: z.discriminatedUnion("type", [
      z.strictObject({
        type: z.literal("MONSTER"),
        targetCardInstanceId: CardInstanceIdV1Schema,
      }),
      z.strictObject({ type: z.literal("DIRECT") }),
    ]),
  }),
});
const EndBattleActionV1Schema = z.strictObject({
  type: z.literal("END_BATTLE"),
  payload: EmptyObjectV1Schema,
});
const SurrenderActionV1Schema = z.strictObject({
  type: z.literal("SURRENDER"),
  payload: EmptyObjectV1Schema,
});

export const HumanBattleActionIntentV1Schema = z.discriminatedUnion("type", [
  SummonActionV1Schema,
  TributeSummonActionV1Schema,
  ChangePositionActionV1Schema,
  EndMainActionV1Schema,
  DeclareAttackActionV1Schema,
  EndBattleActionV1Schema,
  SurrenderActionV1Schema,
]);

export const CanonicalActionTypeV1Schema = z.enum([
  "MULLIGAN_ACCEPT",
  "MULLIGAN_DECLINE",
  "SUMMON",
  "TRIBUTE_SUMMON",
  "CHANGE_POSITION",
  "END_MAIN",
  "DECLARE_ATTACK",
  "END_BATTLE",
  "SURRENDER",
]);

export const VisibleBattleCardV1Schema = z.strictObject({
  visibility: z.literal("VISIBLE"),
  cardInstanceId: CardInstanceIdV1Schema,
  tokenId: TokenIdJsonV1Schema.optional(),
  speciesId: SpeciesIdV1Schema,
  level: z.number().int().min(1).max(6),
  atk: z.number().int().min(800).max(1_560),
  def: z.number().int().min(800).max(1_560),
  element: ElementJsonV1Schema,
  rarity: RarityJsonV1Schema.optional(),
  position: CardPositionV1Schema.optional(),
  summonedThisTurn: z.boolean().optional(),
  attackedThisTurn: z.boolean().optional(),
  positionChangedThisTurn: z.boolean().optional(),
});

export const HiddenCardRefV1Schema = z.strictObject({
  visibility: z.literal("HIDDEN"),
  handIndex: NonNegativeIntegerV1Schema,
});

const PlayerSafeHandCardV1Schema = z.discriminatedUnion("visibility", [
  VisibleBattleCardV1Schema,
  HiddenCardRefV1Schema,
]);

export const PlayerSafeSideStateV1Schema = z.strictObject({
  slot: PlayerSlotV1Schema,
  lp: z.number().int().min(0).max(4_000),
  deckCount: z.number().int().min(0).max(15),
  hand: z.array(PlayerSafeHandCardV1Schema),
  board: z.tuple([
    VisibleBattleCardV1Schema.nullable(),
    VisibleBattleCardV1Schema.nullable(),
    VisibleBattleCardV1Schema.nullable(),
  ]),
  graveyardCount: z.number().int().min(0).max(15),
});

export const MatchResultV1Schema = z.strictObject({
  status: z.literal("MATCH_FINISHED"),
  winner: WinnerSlotV1Schema,
  loser: PlayerSlotV1Schema,
  resultReason: z.enum(["LP_ZERO", "DECK_OUT", "SURRENDER"]),
});

export const MatchCancelledV1Schema = z.strictObject({
  status: z.literal("CANCELLED"),
  cancellationReason: z.enum([
    "SETUP_INVARIANT_FAILURE",
    "BOT_INVALID_INTENT",
    "STATE_CORRUPTION",
    "INTERNAL_ENGINE_FAILURE",
  ]),
});

export const PlayerSafeBattleStateV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  matchId: UuidV1Schema,
  status: MatchStatusV1Schema,
  matchVersion: MatchVersionV1Schema,
  humanSlot: z.literal("PLAYER_1"),
  startingPlayer: PlayerSlotV1Schema.optional(),
  activePlayer: PlayerSlotV1Schema.optional(),
  globalTurnIndex: NonNegativeIntegerV1Schema.optional(),
  phase: BattlePhaseV1Schema.optional(),
  summonUsedThisTurn: z.boolean().optional(),
  player1: PlayerSafeSideStateV1Schema,
  player2: PlayerSafeSideStateV1Schema,
  nextActionIndex: ActionIndexV1Schema,
  result: MatchResultV1Schema.optional(),
  cancellation: MatchCancelledV1Schema.optional(),
});

export const StartMatchRequestV1Schema = z.strictObject({
  startRequestId: UuidV1Schema,
  deckVersion: PositiveIntegerV1Schema,
});
export const StartMatchResponseV1Schema = z.strictObject({
  matchId: UuidV1Schema,
  status: MatchStatusV1Schema,
  state: PlayerSafeBattleStateV1Schema,
  requiredNextAction: z.enum(["MULLIGAN", "BATTLE_ACTION", "NONE"]),
});
export const MulliganRequestV1Schema = z.strictObject({
  expectedMatchVersion: MatchVersionV1Schema,
  decision: z.enum(["ACCEPT", "DECLINE"]),
});
export const SubmitBattleActionRequestV1Schema = z.strictObject({
  expectedMatchVersion: MatchVersionV1Schema,
  action: HumanBattleActionIntentV1Schema,
});

export const EngineLocationV1Schema = z.enum([
  "DECK",
  "HAND",
  "BOARD",
  "GRAVEYARD",
]);
export const ExitReasonV1Schema = z.enum(["NONE", "DESTROYED", "TRIBUTED"]);
export const MulliganStateV1Schema = z.enum(["PENDING", "ACCEPT", "DECLINE"]);
const ZoneIndexV1Schema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const EngineCardStateV1Schema = BattleCardSnapshotV1Schema.extend({
  location: EngineLocationV1Schema,
  zoneIndex: ZoneIndexV1Schema.nullable(),
  position: CardPositionV1Schema.nullable(),
  summonedOnTurn: NonNegativeIntegerV1Schema,
  attackedOnTurn: NonNegativeIntegerV1Schema,
  positionChangedOnTurn: NonNegativeIntegerV1Schema,
  exitReason: ExitReasonV1Schema,
});

export const EngineSideStateV1Schema = z.strictObject({
  slot: PlayerSlotV1Schema,
  lp: z.number().int().min(0).max(4_000),
  deck: z.array(CardInstanceIdV1Schema),
  hand: z.array(CardInstanceIdV1Schema),
  board: z.tuple([
    CardInstanceIdV1Schema.nullable(),
    CardInstanceIdV1Schema.nullable(),
    CardInstanceIdV1Schema.nullable(),
  ]),
  graveyard: z.array(CardInstanceIdV1Schema),
  lastSummonTurn: NonNegativeIntegerV1Schema,
  mulligan: MulliganStateV1Schema,
});

export const AuthoritativeBattleStateV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    matchId: UuidV1Schema,
    status: MatchStatusV1Schema,
    matchVersion: MatchVersionV1Schema,
    humanSlot: z.literal("PLAYER_1"),
    startingPlayer: PlayerSlotV1Schema.nullable(),
    activePlayer: PlayerSlotV1Schema.nullable(),
    globalTurnIndex: NonNegativeIntegerV1Schema,
    phase: BattlePhaseV1Schema.nullable(),
    nextActionIndex: ActionIndexV1Schema,
    player1: EngineSideStateV1Schema,
    player2: EngineSideStateV1Schema,
    cards: z.array(EngineCardStateV1Schema).length(30),
    result: MatchResultV1Schema.nullable(),
    cancellation: MatchCancelledV1Schema.nullable(),
  })
  .refine(
    ({ cards }) =>
      cards.every((card, index) => card.cardInstanceId === index + 1),
    { message: "cards must be sorted by cardInstanceId" },
  );

export type MatchStatusV1 = z.infer<typeof MatchStatusV1Schema>;
export type BattlePhaseV1 = z.infer<typeof BattlePhaseV1Schema>;
export type PlayerSlotV1 = z.infer<typeof PlayerSlotV1Schema>;
export type WinnerSlotV1 = z.infer<typeof WinnerSlotV1Schema>;
export type CardPositionV1 = z.infer<typeof CardPositionV1Schema>;
export type BattleCardSnapshotV1 = z.infer<typeof BattleCardSnapshotV1Schema>;
export type HumanInitialDeckEntryV1 = z.infer<
  typeof HumanInitialDeckEntryV1Schema
>;
export type BotInitialDeckEntryV1 = z.infer<typeof BotInitialDeckEntryV1Schema>;
export type HumanInitialDeckSnapshotV1 = z.infer<
  typeof HumanInitialDeckSnapshotV1Schema
>;
export type BotInitialDeckSnapshotV1 = z.infer<
  typeof BotInitialDeckSnapshotV1Schema
>;
export type HumanBattleActionIntentV1 = z.infer<
  typeof HumanBattleActionIntentV1Schema
>;
export type CanonicalActionTypeV1 = z.infer<typeof CanonicalActionTypeV1Schema>;
export type VisibleBattleCardV1 = z.infer<typeof VisibleBattleCardV1Schema>;
export type HiddenCardRefV1 = z.infer<typeof HiddenCardRefV1Schema>;
export type PlayerSafeSideStateV1 = z.infer<typeof PlayerSafeSideStateV1Schema>;
export type MatchResultV1 = z.infer<typeof MatchResultV1Schema>;
export type MatchCancelledV1 = z.infer<typeof MatchCancelledV1Schema>;
export type PlayerSafeBattleStateV1 = z.infer<
  typeof PlayerSafeBattleStateV1Schema
>;
export type StartMatchRequestV1 = z.infer<typeof StartMatchRequestV1Schema>;
export type StartMatchResponseV1 = z.infer<typeof StartMatchResponseV1Schema>;
export type MulliganRequestV1 = z.infer<typeof MulliganRequestV1Schema>;
export type SubmitBattleActionRequestV1 = z.infer<
  typeof SubmitBattleActionRequestV1Schema
>;
export type EngineLocationV1 = z.infer<typeof EngineLocationV1Schema>;
export type ExitReasonV1 = z.infer<typeof ExitReasonV1Schema>;
export type MulliganStateV1 = z.infer<typeof MulliganStateV1Schema>;
export type EngineCardStateV1 = z.infer<typeof EngineCardStateV1Schema>;
export type EngineSideStateV1 = z.infer<typeof EngineSideStateV1Schema>;
export type AuthoritativeBattleStateV1 = z.infer<
  typeof AuthoritativeBattleStateV1Schema
>;
