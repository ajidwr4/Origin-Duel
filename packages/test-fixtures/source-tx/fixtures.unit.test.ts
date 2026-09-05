import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ActivityClassV1Schema } from "../../domain/src/constants/index.js";
import { ResolvedMonsterV1Schema } from "../../domain/src/monster/index.js";
import {
  Bytes32HexV1Schema,
  TokenIdJsonV1Schema,
  WalletAddressSchema,
} from "../../domain/src/primitives/index.js";
import { TransactionDNAV1Schema } from "../../domain/src/transaction/index.js";
import {
  ASSET_APPROVAL_INPUT_SCHEMA_V1,
  BATTLE_REPLAY_INPUT_SCHEMA_V1,
  BIGINT_BOUNDARY_V1,
  CROSS_LAYER_MONSTER_V1,
  FROZEN_TRANSACTION_DNA_V1,
  FROZEN_TYPE2_SOURCE_TX_V1,
  JCS_PRODUCER_INPUT_V1,
  MATCH_START_IDEMPOTENCY_V1,
  MONSTER_GENERATION_VECTORS_V1,
  MONSTER_HASH_INPUT_V1,
  PROFILE_DEFAULT_V1,
  parseFrozenTransactionDnaV1,
  parseFrozenType2SourceTxV1,
  parseMonsterGenerationVectorsV1,
  RENDERER_PRODUCER_INPUT_V1,
} from "../src/index.js";

describe("source-owned fixture corpus", () => {
  it("loads the frozen Type-2 input and expected bytes exactly", () => {
    expect(FROZEN_TYPE2_SOURCE_TX_V1).toEqual({
      input: {
        chainId: "11155111",
        nonce: "7",
        maxPriorityFeePerGas: "1000000000",
        maxFeePerGas: "2000000000",
        gasLimit: "21000",
        to: "0x1111111111111111111111111111111111111111",
        value: "123456789",
        input: "0x",
        accessList: [],
        yParity: 1,
        r: "0x1234",
        s: "0x5678",
      },
      expectedRawSignedType2:
        "0x02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678",
      expectedSourceTx:
        "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
    });
    expect(
      Bytes32HexV1Schema.safeParse(FROZEN_TYPE2_SOURCE_TX_V1.expectedSourceTx)
        .success,
    ).toBe(true);
  });

  it("loads the exact frozen DNA values and sample-0 domains", () => {
    expect(FROZEN_TRANSACTION_DNA_V1).toEqual({
      input: {
        activityClass: 3,
        blockHeight: "6000000",
        transactionIndex: "42",
        generationSpecVersion: 1,
      },
      expectedEntropyDigest:
        "0x2dc4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      expectedEntropyPayload:
        "0xc4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      expectedTransactionDNA:
        "0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      expectedEntropySeed:
        "0x00c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      expectedSample0: {
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
    });
    expect(
      TransactionDNAV1Schema.safeParse(
        FROZEN_TRANSACTION_DNA_V1.expectedTransactionDNA,
      ).success,
    ).toBe(true);
  });

  it("loads all Phase 5 A/B/C inputs, samples, rolls, and outputs", () => {
    expect(
      MONSTER_GENERATION_VECTORS_V1.map(({ id, expected }) => ({
        id,
        ...expected,
      })),
    ).toEqual([
      {
        id: "A",
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
      {
        id: "B",
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
      {
        id: "C",
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
    ]);

    expect(
      MONSTER_GENERATION_VECTORS_V1.map(({ transactionDNA, sample0 }) => ({
        transactionDNA,
        sample0,
      })),
    ).toEqual([
      {
        transactionDNA:
          "0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
        sample0: FROZEN_TRANSACTION_DNA_V1.expectedSample0,
      },
      {
        transactionDNA:
          "0x0200000000000000000000000000000000000000000000000000000000000002",
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
      },
      {
        transactionDNA:
          "0x010000000000000000000000000000000000000000000000000000000000000d",
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
      },
    ]);
  });

  it("loads exact Phase 10 Monster, profile, and match-start fixtures", () => {
    expect(ResolvedMonsterV1Schema.parse(CROSS_LAYER_MONSTER_V1)).toEqual(
      CROSS_LAYER_MONSTER_V1,
    );
    expect({
      CROSS_LAYER_MONSTER_V1,
      PROFILE_DEFAULT_V1,
      MATCH_START_IDEMPOTENCY_V1,
    }).toMatchInlineSnapshot(`
        {
          "CROSS_LAYER_MONSTER_V1": {
            "atk": 800,
            "def": 1200,
            "element": "WIND",
            "level": 3,
            "rarity": "RARE",
            "sourceTx": "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
            "speciesId": 7,
            "transactionDNA": "0x050102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
          },
          "MATCH_START_IDEMPOTENCY_V1": {
            "expected": {
              "duplicateReturnsSameMatchId": true,
              "duplicateReturnsSamePersistedMatchSeed": true,
            },
            "human": "0x1111111111111111111111111111111111111111",
            "startRequestId": "8b5b286b-3016-4f9c-b04f-88bdb9d9b0de",
          },
          "PROFILE_DEFAULT_V1": {
            "databaseRowExists": false,
            "expectedApi": {
              "playerLevel": 1,
              "totalWins": 0,
            },
          },
        }
      `);
  });
});

describe("fixture validation and integrity", () => {
  it("loads exact fixtures and rejects malformed copies", () => {
    expect(parseFrozenType2SourceTxV1(FROZEN_TYPE2_SOURCE_TX_V1)).toBe(
      FROZEN_TYPE2_SOURCE_TX_V1,
    );
    expect(parseFrozenTransactionDnaV1(FROZEN_TRANSACTION_DNA_V1)).toBe(
      FROZEN_TRANSACTION_DNA_V1,
    );
    expect(parseMonsterGenerationVectorsV1(MONSTER_GENERATION_VECTORS_V1)).toBe(
      MONSTER_GENERATION_VECTORS_V1,
    );

    expect(() =>
      parseFrozenType2SourceTxV1({
        ...FROZEN_TYPE2_SOURCE_TX_V1,
        expectedSourceTx: `0x${"00".repeat(32)}`,
      }),
    ).toThrow(TypeError);
    expect(() =>
      parseFrozenTransactionDnaV1({
        ...FROZEN_TRANSACTION_DNA_V1,
        input: { ...FROZEN_TRANSACTION_DNA_V1.input, activityClass: 6 },
      }),
    ).toThrow(TypeError);
    expect(() => parseMonsterGenerationVectorsV1([])).toThrow(TypeError);
  });

  it("keeps source fixture module checksums stable", () => {
    const modules = {
      "source-tx/index.js": new URL("./index.js", import.meta.url),
      "transaction-dna/index.js": new URL(
        "../transaction-dna/index.js",
        import.meta.url,
      ),
      "monster-generation/index.js": new URL(
        "../monster-generation/index.js",
        import.meta.url,
      ),
      "bigint/index.js": new URL("../bigint/index.js", import.meta.url),
    };
    const checksums = Object.fromEntries(
      Object.entries(modules).map(([name, url]) => [
        name,
        createHash("sha256").update(readFileSync(url)).digest("hex"),
      ]),
    );

    expect(checksums).toEqual({
      "source-tx/index.js":
        "581f48dcd2b4504c214bd6213b7731f3ca250b7154e40c10e360f23200f6f8d7",
      "transaction-dna/index.js":
        "65fa1fb7a6117ba25d449d3844c8ab5cd3de80a6ad4ea050fd73d417357ebac0",
      "monster-generation/index.js":
        "00c046b17d7f33059c5f0810af3466eb36072fc8479d8b309ac5b32f29e18499",
      "bigint/index.js":
        "f009a1485ff792a94055ef9cead95767b57ea057a6bb41ab662d1894316a81fd",
    });
  });

  it("preserves canonical bigint, primitive, enum, and version evidence", () => {
    expect(
      BIGINT_BOUNDARY_V1.validUint256Decimal.every(
        (value) => TokenIdJsonV1Schema.safeParse(value).success,
      ),
    ).toBe(true);
    expect(
      BIGINT_BOUNDARY_V1.invalidUint256Decimal.every(
        (value) => !TokenIdJsonV1Schema.safeParse(value).success,
      ),
    ).toBe(true);
    expect([...BIGINT_BOUNDARY_V1.lexicalOrderingTrap].sort()).toEqual([
      "10",
      "2",
    ]);
    expect(
      [...BIGINT_BOUNDARY_V1.lexicalOrderingTrap].sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : 1,
      ),
    ).toEqual(["2", "10"]);
    expect(
      WalletAddressSchema.safeParse(BIGINT_BOUNDARY_V1.canonicalAddress)
        .success,
    ).toBe(true);
    expect(
      Bytes32HexV1Schema.safeParse(BIGINT_BOUNDARY_V1.canonicalBytes32).success,
    ).toBe(true);
    expect(
      BIGINT_BOUNDARY_V1.enumParity.activityClass.every(
        (value) => ActivityClassV1Schema.safeParse(value).success,
      ),
    ).toBe(true);
    expect(Object.values(BIGINT_BOUNDARY_V1.versionParity)).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });

  it("leaves implementation-owned expected outputs unpopulated", () => {
    expect(MONSTER_HASH_INPUT_V1).toEqual({ monster: CROSS_LAYER_MONSTER_V1 });
    expect(JCS_PRODUCER_INPUT_V1).toEqual({
      resolvedMonster: CROSS_LAYER_MONSTER_V1,
    });
    expect(RENDERER_PRODUCER_INPUT_V1).toEqual({
      resolvedMonster: CROSS_LAYER_MONSTER_V1,
    });
    expect(ASSET_APPROVAL_INPUT_SCHEMA_V1.producerTaskIds).toEqual([
      "M03-T05",
      "M07-T05",
    ]);
    expect(BATTLE_REPLAY_INPUT_SCHEMA_V1.producerTaskIds).toEqual([
      "M10-T01",
      "M10-T05",
    ]);

    for (const fixture of [
      MONSTER_HASH_INPUT_V1,
      JCS_PRODUCER_INPUT_V1,
      RENDERER_PRODUCER_INPUT_V1,
      ASSET_APPROVAL_INPUT_SCHEMA_V1,
      BATTLE_REPLAY_INPUT_SCHEMA_V1,
    ]) {
      expect(fixture).not.toHaveProperty("expectedDigest");
      expect(fixture).not.toHaveProperty("expectedSignature");
      expect(fixture).not.toHaveProperty("expectedRecoveredSigner");
      expect(fixture).not.toHaveProperty("expectedMonsterHash");
      expect(fixture).not.toHaveProperty("expectedPngBytes");
      expect(fixture).not.toHaveProperty("expectedJcsBytes");
      expect(fixture).not.toHaveProperty("expectedCid");
      expect(fixture).not.toHaveProperty("expectedStartingPlayer");
      expect(fixture).not.toHaveProperty("expectedShuffle");
      expect(fixture).not.toHaveProperty("expectedReplayResult");
    }
  });
});
