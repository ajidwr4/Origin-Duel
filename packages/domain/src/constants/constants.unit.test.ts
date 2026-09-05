import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CLASS_SYMBOLS_V1,
  ActivityClass,
  ActivityClassJsonV1Schema,
  ActivityClassV1Schema,
  BLOCK_PROVER,
  BOT_POLICY_VERSION,
  CAPTURE_COOLDOWN_SECONDS,
  CREDITCOIN_RECONCILIATION_FINALITY_POLICY,
  CREDITCOIN_TESTNET_CHAIN_ID,
  DOMAIN_ELEMENT,
  DOMAIN_LEVEL,
  DOMAIN_RARITY,
  DOMAIN_SAMPLE_PREFIX,
  DOMAIN_SPECIES,
  DOMAIN_STAT_ALLOCATION,
  Element,
  ElementJsonV1Schema,
  ElementV1Schema,
  GENERATION_SPEC_VERSION,
  MAX_CLASSIFIER_LOG_DATA_BYTES_V1,
  MAX_CLASSIFIER_LOGS_V1,
  MAX_ENCODED_TRANSACTION_BYTES_V1,
  MAX_REJECTION_ATTEMPTS,
  Rarity,
  RarityJsonV1Schema,
  RarityV1Schema,
  SEPOLIA_CHAIN_ID,
  SOURCE_PROFILE,
  SPECIES_REGISTRY_V1,
  SpeciesIdV1Schema,
  TRANSACTION_DNA_ENTROPY_DOMAIN,
} from "./index.js";

describe("canonical V1 vocabulary", () => {
  it("preserves exact enum numeric and wire values", () => {
    expect(ActivityClass).toEqual({
      UNKNOWN: 0,
      NATIVE_TRANSFER: 1,
      ERC20_ACTIVITY: 2,
      ERC721_ACTIVITY: 3,
      ERC1155_ACTIVITY: 4,
      CONTRACT_INTERACTION: 5,
    });
    expect(Element).toEqual({ FIRE: 0, WATER: 1, WIND: 2 });
    expect(Rarity).toEqual({ COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 });
    expect(ACTIVITY_CLASS_SYMBOLS_V1).toHaveLength(6);
  });

  it("rejects unknown numeric and wire enum values", () => {
    expect(ActivityClassV1Schema.safeParse(6).success).toBe(false);
    expect(ActivityClassJsonV1Schema.safeParse("ERC721").success).toBe(false);
    expect(ElementV1Schema.safeParse(3).success).toBe(false);
    expect(ElementJsonV1Schema.safeParse("EARTH").success).toBe(false);
    expect(RarityV1Schema.safeParse(4).success).toBe(false);
    expect(RarityJsonV1Schema.safeParse("MYTHIC").success).toBe(false);
  });

  it("preserves the exact species registry", () => {
    expect(SPECIES_REGISTRY_V1.map(({ id, code }) => [id, code])).toEqual([
      [1, "NULL_WISP"],
      [2, "ECHO_MIMIC"],
      [3, "COURIER_BEAST"],
      [4, "VAULT_HORN"],
      [5, "LEDGER_SLIME"],
      [6, "TOKEN_GOLEM"],
      [7, "RELIC_LYNX"],
      [8, "PRISM_STAG"],
      [9, "SWARM_BEETLE"],
      [10, "MOSAIC_HYDRA"],
      [11, "BYTE_IMP"],
      [12, "CIRCUIT_DRAKE"],
    ]);
    expect(SpeciesIdV1Schema.safeParse(0).success).toBe(false);
    expect(SpeciesIdV1Schema.safeParse(13).success).toBe(false);
  });
});

describe("canonical V1 constants", () => {
  it("preserves chain, profile, resource, and version constants", () => {
    expect(CREDITCOIN_TESTNET_CHAIN_ID).toBe(102_031);
    expect(SEPOLIA_CHAIN_ID).toBe(11_155_111);
    expect(BLOCK_PROVER).toBe("0x0000000000000000000000000000000000000fd2");
    expect(SOURCE_PROFILE).toBe("EIP1559_TYPE2_EMPTY_ACCESS_LIST_V1");
    expect(CAPTURE_COOLDOWN_SECONDS).toBe(60);
    expect(MAX_ENCODED_TRANSACTION_BYTES_V1).toBe(65_536);
    expect(MAX_CLASSIFIER_LOGS_V1).toBe(64);
    expect(MAX_CLASSIFIER_LOG_DATA_BYTES_V1).toBe(8_192);
    expect(GENERATION_SPEC_VERSION).toBe(1);
    expect(BOT_POLICY_VERSION).toBe("MVP_V1");
    expect(MAX_REJECTION_ATTEMPTS).toBe(4);
    expect(CREDITCOIN_RECONCILIATION_FINALITY_POLICY).toBe(
      "REQUIRED_DEPLOYMENT_POLICY_NO_CANONICAL_DEFAULT",
    );
  });

  it("preserves exact frozen generation domains", () => {
    expect([
      TRANSACTION_DNA_ENTROPY_DOMAIN,
      DOMAIN_LEVEL,
      DOMAIN_ELEMENT,
      DOMAIN_SPECIES,
      DOMAIN_RARITY,
      DOMAIN_STAT_ALLOCATION,
      DOMAIN_SAMPLE_PREFIX,
    ]).toEqual([
      "0xd891cfbba83871d32c54a3106a635eeae6e495b48b486a03cc350d2a3d4e97b6",
      "0x061fbddcd4693061855e58ee274274cdb76c6fdd1e56b05c3dcc6b43b4357827",
      "0xf3549922386d10f4c332c69f3cb6c5f576110a658ef6ac3afb3e0b55e4ff77f7",
      "0x1848e2ae1f663e29b7f5909820a90502818e1a71eecacc08af674e58635cfb3b",
      "0x719cb45f964b9a3762e17e0bc1fa15a857718422a2a00c7b6bb91def4850f8d8",
      "0xdcef4bec126e8a43392ec21e575d4a1d362d8f4bb91fe4ade415fdfb3cd17ce9",
      "0xffcdc59364285e629ed64257102cdfe73e2ffe86d269b2880f48c93a9859c129",
    ]);
  });
});
