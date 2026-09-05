import { isDeepStrictEqual } from "node:util";

export const MONSTER_GENERATION_VECTORS_V1 = Object.freeze([
  {
    id: "A",
    transactionDNA:
      "0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
    activityClass: 3,
    entropySeed:
      "0x00c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
    sample0: {
      level:
        "0x51ecad2a428a282ac9399965a62fd9e1c127cd87bc5bca9d664dba68d6aca753",
      element:
        "0x90f57f3ff3567349e5baa4573a63b08cec7ef95ed4a26ee3d01c5891d7077096",
      species:
        "0x30f589a8a9bea66b8ff7a15ada62efc75c89f00d66f0ca0686c9ff56ee9e24e0",
      rarity:
        "0x8e07002a46e0195350d8993e2da775b091057cee24e06099c137e700554f835c",
      statAllocation:
        "0x20ccc8654b90ae24f179eabdf16cb7d2aeb4b7577feb5de92544cc4949695987",
    },
    expected: {
      levelRoll: 7,
      level: 3,
      band: "NORMAL",
      powerBudget: 2000,
      profileRoll: 2,
      profile: "DEFENSIVE",
      atk: 800,
      def: 1200,
      rarityRoll: 56,
      rarity: "RARE",
      elementRoll: 2,
      element: "WIND",
      speciesChoice: 0,
      speciesId: 7,
      speciesCode: "RELIC_LYNX",
    },
  },
  {
    id: "B",
    transactionDNA:
      "0x0200000000000000000000000000000000000000000000000000000000000002",
    activityClass: 2,
    sample0: {
      level:
        "0x62228e3a3cfca54f89c02e455a0a76a28a717bb6b9d353cbe1d41ddbd98195c7",
      element:
        "0x0aa7bff22223eeebe66c18f7762f6c5eb4c96629f2479b64d68671312861cee1",
      species:
        "0x2dbcb95710e53b0ea58516a10ebd2c33f11dfa9ef31e918845afbe185719ed70",
      rarity:
        "0x88ebec6497a0122d1411aba72c9547280ccc50905146ce3b0360b33fbc88f86f",
      statAllocation:
        "0x93314993c8f9261d16af6f094317de4044aee5e1a79695fc0ff32dca670adc72",
    },
    expected: {
      levelRoll: 3,
      level: 2,
      band: "NORMAL",
      powerBudget: 2000,
      profileRoll: 1,
      profile: "BALANCED",
      atk: 1000,
      def: 1000,
      rarityRoll: 95,
      rarity: "LEGENDARY",
      elementRoll: 2,
      element: "WIND",
      speciesChoice: 0,
      speciesId: 5,
      speciesCode: "LEDGER_SLIME",
    },
  },
  {
    id: "C",
    transactionDNA:
      "0x010000000000000000000000000000000000000000000000000000000000000d",
    activityClass: 1,
    sample0: {
      level:
        "0x5e453acff37927c9cd9bcea083a4aa29808cd1826f165fcb1b9b92c02fe175e7",
      element:
        "0x5f5636a0d852f2732b32e7435576496a7d07ce23d6367a068b6659cf62766c8a",
      species:
        "0xbf65631bc060ecafcffb832e83e995f27bc75cf0dc81b70a6e1f05d03582ffde",
      rarity:
        "0xb128293796f68b2ba385bdbda9ec2a4928ad2652ec79160688443b5335f7c1ed",
      statAllocation:
        "0x9861414960cd4261cafd85b5039c190367f86cb403459b1d9de00f036e112061",
    },
    expected: {
      levelRoll: 11,
      level: 6,
      band: "TRIBUTE",
      powerBudget: 2600,
      profileRoll: 0,
      profile: "OFFENSIVE",
      atk: 1560,
      def: 1040,
      rarityRoll: 49,
      rarity: "COMMON",
      elementRoll: 0,
      element: "FIRE",
      speciesChoice: 0,
      speciesId: 3,
      speciesCode: "COURIER_BEAST",
    },
  },
]);

export const CROSS_LAYER_MONSTER_V1 = Object.freeze({
  speciesId: 7,
  level: 3,
  atk: 800,
  def: 1200,
  element: "WIND",
  rarity: "RARE",
  transactionDNA:
    "0x050102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  sourceTx:
    "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
});

export const PROFILE_DEFAULT_V1 = Object.freeze({
  databaseRowExists: false,
  expectedApi: { totalWins: 0, playerLevel: 1 },
});

export const MATCH_START_IDEMPOTENCY_V1 = Object.freeze({
  human: "0x1111111111111111111111111111111111111111",
  startRequestId: "8b5b286b-3016-4f9c-b04f-88bdb9d9b0de",
  expected: {
    duplicateReturnsSameMatchId: true,
    duplicateReturnsSamePersistedMatchSeed: true,
  },
});

export function parseMonsterGenerationVectorsV1(value) {
  if (!isDeepStrictEqual(value, MONSTER_GENERATION_VECTORS_V1)) {
    throw new TypeError("invalid frozen Monster generation fixtures");
  }
  return value;
}
