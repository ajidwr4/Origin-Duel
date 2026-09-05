import { describe, expect, it } from "vitest";
import {
  BattleCardSnapshotV1Schema,
  BotInitialDeckEntryV1Schema,
  HiddenCardRefV1Schema,
  HumanBattleActionIntentV1Schema,
  HumanInitialDeckEntryV1Schema,
  MatchStatusV1Schema,
  PlayerSafeBattleStateV1Schema,
} from "./index.js";

const UUID = "3a4a24b8-32a4-4b46-8fab-2ff21cc6791c";

const visibleCard = {
  visibility: "VISIBLE",
  cardInstanceId: 1,
  tokenId: "0",
  speciesId: 7,
  level: 3,
  atk: 800,
  def: 1_200,
  element: "WIND",
  rarity: "RARE",
} as const;

const safeState = {
  schemaVersion: 1,
  matchId: UUID,
  status: "SETUP_MULLIGAN",
  matchVersion: 1,
  humanSlot: "PLAYER_1",
  globalTurnIndex: 0,
  player1: {
    slot: "PLAYER_1",
    lp: 4_000,
    deckCount: 10,
    hand: [visibleCard],
    board: [null, null, null],
    graveyardCount: 0,
  },
  player2: {
    slot: "PLAYER_2",
    lp: 4_000,
    deckCount: 10,
    hand: [{ visibility: "HIDDEN", handIndex: 0 }],
    board: [null, null, null],
    graveyardCount: 0,
  },
  nextActionIndex: 1,
} as const;

describe("battle action vocabulary", () => {
  it("preserves the exact match status registry", () => {
    expect(MatchStatusV1Schema.options).toEqual([
      "MATCH_CREATED",
      "SETUP_SHUFFLE_DRAW",
      "SETUP_MULLIGAN",
      "MATCH_READY",
      "MATCH_ACTIVE",
      "MATCH_FINISHED",
      "CANCELLED",
    ]);
  });

  it.each([
    { type: "SUMMON", payload: { cardInstanceId: 1, initialPosition: "ATK" } },
    {
      type: "TRIBUTE_SUMMON",
      payload: {
        cardInstanceId: 16,
        tributeCardInstanceId: 17,
        initialPosition: "DEF",
      },
    },
    { type: "CHANGE_POSITION", payload: { cardInstanceId: 2 } },
    { type: "END_MAIN", payload: {} },
    {
      type: "DECLARE_ATTACK",
      payload: {
        attackerCardInstanceId: 1,
        target: { type: "MONSTER", targetCardInstanceId: 16 },
      },
    },
    {
      type: "DECLARE_ATTACK",
      payload: { attackerCardInstanceId: 1, target: { type: "DIRECT" } },
    },
    { type: "END_BATTLE", payload: {} },
    { type: "SURRENDER", payload: {} },
  ])("accepts canonical intent $type", (intent) => {
    expect(HumanBattleActionIntentV1Schema.safeParse(intent).success).toBe(
      true,
    );
  });

  it.each([
    { type: "DRAW", payload: {} },
    { type: "END_MAIN", payload: { force: true } },
    { type: "SUMMON", payload: { cardInstanceId: 0, initialPosition: "ATK" } },
    { type: "SUMMON", payload: { cardInstanceId: 31, initialPosition: "ATK" } },
    {
      type: "DECLARE_ATTACK",
      payload: { attackerCardInstanceId: 1, target: null },
    },
  ])("rejects noncanonical battle intent", (intent) => {
    expect(HumanBattleActionIntentV1Schema.safeParse(intent).success).toBe(
      false,
    );
  });
});

describe("battle state and hidden information", () => {
  it("snapshots the exact player-safe projection", () => {
    expect(
      PlayerSafeBattleStateV1Schema.parse(safeState),
    ).toMatchInlineSnapshot(`
      {
        "globalTurnIndex": 0,
        "humanSlot": "PLAYER_1",
        "matchId": "3a4a24b8-32a4-4b46-8fab-2ff21cc6791c",
        "matchVersion": 1,
        "nextActionIndex": 1,
        "player1": {
          "board": [
            null,
            null,
            null,
          ],
          "deckCount": 10,
          "graveyardCount": 0,
          "hand": [
            {
              "atk": 800,
              "cardInstanceId": 1,
              "def": 1200,
              "element": "WIND",
              "level": 3,
              "rarity": "RARE",
              "speciesId": 7,
              "tokenId": "0",
              "visibility": "VISIBLE",
            },
          ],
          "lp": 4000,
          "slot": "PLAYER_1",
        },
        "player2": {
          "board": [
            null,
            null,
            null,
          ],
          "deckCount": 10,
          "graveyardCount": 0,
          "hand": [
            {
              "handIndex": 0,
              "visibility": "HIDDEN",
            },
          ],
          "lp": 4000,
          "slot": "PLAYER_2",
        },
        "schemaVersion": 1,
        "status": "SETUP_MULLIGAN",
      }
    `);
  });

  it("rejects every forbidden hidden-card identity field and matchSeed", () => {
    for (const forbidden of [
      "cardInstanceId",
      "tokenId",
      "speciesId",
      "atk",
      "def",
      "element",
      "rarity",
      "position",
    ]) {
      expect(
        HiddenCardRefV1Schema.safeParse({
          visibility: "HIDDEN",
          handIndex: 0,
          [forbidden]: forbidden === "element" ? "FIRE" : 1,
        }).success,
      ).toBe(false);
    }
    expect(
      PlayerSafeBattleStateV1Schema.safeParse({
        ...safeState,
        matchSeed: `0x${"aa".repeat(32)}`,
      }).success,
    ).toBe(false);
    expect(
      PlayerSafeBattleStateV1Schema.safeParse({
        ...safeState,
        player2: { ...safeState.player2, deck: [16, 17] },
      }).success,
    ).toBe(false);
  });

  it("bounds concurrency and action indexes", () => {
    expect(
      PlayerSafeBattleStateV1Schema.safeParse({
        ...safeState,
        matchVersion: -1,
      }).success,
    ).toBe(false);
    expect(
      PlayerSafeBattleStateV1Schema.safeParse({
        ...safeState,
        nextActionIndex: 0,
      }).success,
    ).toBe(false);
  });

  it("enforces card snapshot and origin ranges", () => {
    const card = {
      cardInstanceId: 1,
      level: 3,
      baseAtk: 800,
      baseDef: 1_200,
      element: "WIND",
    };
    expect(BattleCardSnapshotV1Schema.safeParse(card).success).toBe(true);
    expect(
      HumanInitialDeckEntryV1Schema.safeParse({
        ...card,
        tokenId: "0",
        speciesId: 7,
        rarity: "RARE",
      }).success,
    ).toBe(true);
    expect(
      BotInitialDeckEntryV1Schema.safeParse({
        ...card,
        systemCardId: "BOT-1",
        speciesId: 7,
        rarity: "RARE",
      }).success,
    ).toBe(false);
  });
});
