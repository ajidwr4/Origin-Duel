import { z } from "zod";
import type { Bytes32HexV1, WalletAddress } from "../primitives/index.js";

export const CREDITCOIN_TESTNET_CHAIN_ID = 102_031;
export const SEPOLIA_CHAIN_ID = 11_155_111;
export const ATTESTCOIN_SEPOLIA_CHAIN_KEY = 1;
export const BLOCK_PROVER =
  "0x0000000000000000000000000000000000000fd2" as WalletAddress;
export const SOURCE_PROFILE = "EIP1559_TYPE2_EMPTY_ACCESS_LIST_V1";
export const CLAIMANT_MODE_V1 = "DIRECT_TX_SENDER";
export const CREDITCOIN_RECONCILIATION_FINALITY_POLICY =
  "REQUIRED_DEPLOYMENT_POLICY_NO_CANONICAL_DEFAULT";

export const CAPTURE_COOLDOWN_SECONDS = 60;
export const MAX_ENCODED_TRANSACTION_BYTES_V1 = 65_536;
export const MAX_CLASSIFIER_LOGS_V1 = 64;
export const MAX_CLASSIFIER_LOG_DATA_BYTES_V1 = 8_192;

export const GENERATION_SPEC_VERSION = 1;
export const ART_SPEC_VERSION = 1;
export const METADATA_SPEC_VERSION = 1;
export const CARD_RENDERER_SPEC_VERSION = 1;
export const FONT_BUNDLE_VERSION = 1;
export const API_MAJOR_VERSION = 1;
export const BATTLE_STATE_SCHEMA_VERSION = 1;
export const BATTLE_ACTION_SCHEMA_VERSION = 1;
export const BOT_POLICY_VERSION = "MVP_V1";

export const AUTH_CHALLENGE_TTL_SECONDS = 300;
export const AUTH_SESSION_TTL_SECONDS = 43_200;
export const ASSET_APPROVAL_TTL_SECONDS = 900;

export const COLLECTION_SCAN_DEFAULT_LIMIT = 50;
export const COLLECTION_SCAN_MAX_LIMIT = 100;
export const MARKETPLACE_SCAN_DEFAULT_LIMIT = 50;
export const MARKETPLACE_SCAN_MAX_LIMIT = 100;

export const BATTLE_STARTING_LP = 4_000;
export const BATTLE_DECK_SIZE = 15;
export const BATTLE_OPENING_HAND = 5;
export const BATTLE_MONSTER_ZONES = 3;

export const TRANSACTION_DNA_ENTROPY_DOMAIN =
  "0xd891cfbba83871d32c54a3106a635eeae6e495b48b486a03cc350d2a3d4e97b6" as Bytes32HexV1;
export const DOMAIN_LEVEL =
  "0x061fbddcd4693061855e58ee274274cdb76c6fdd1e56b05c3dcc6b43b4357827" as Bytes32HexV1;
export const DOMAIN_ELEMENT =
  "0xf3549922386d10f4c332c69f3cb6c5f576110a658ef6ac3afb3e0b55e4ff77f7" as Bytes32HexV1;
export const DOMAIN_SPECIES =
  "0x1848e2ae1f663e29b7f5909820a90502818e1a71eecacc08af674e58635cfb3b" as Bytes32HexV1;
export const DOMAIN_RARITY =
  "0x719cb45f964b9a3762e17e0bc1fa15a857718422a2a00c7b6bb91def4850f8d8" as Bytes32HexV1;
export const DOMAIN_STAT_ALLOCATION =
  "0xdcef4bec126e8a43392ec21e575d4a1d362d8f4bb91fe4ade415fdfb3cd17ce9" as Bytes32HexV1;
export const DOMAIN_SAMPLE_PREFIX =
  "0xffcdc59364285e629ed64257102cdfe73e2ffe86d269b2880f48c93a9859c129" as Bytes32HexV1;

export const MAX_REJECTION_ATTEMPTS = 4;
export const NORMAL_POWER_BUDGET = 2_000;
export const TRIBUTE_POWER_BUDGET = 2_600;
export const OFFENSIVE_ATK_BPS = 6_000;
export const BALANCED_ATK_BPS = 5_000;
export const DEFENSIVE_ATK_BPS = 4_000;
export const BPS_DENOMINATOR = 10_000;
export const MIN_MONSTER_STAT = 800;
export const MAX_MONSTER_STAT = 1_560;

export const ActivityClass = {
  UNKNOWN: 0,
  NATIVE_TRANSFER: 1,
  ERC20_ACTIVITY: 2,
  ERC721_ACTIVITY: 3,
  ERC1155_ACTIVITY: 4,
  CONTRACT_INTERACTION: 5,
} as const;

export const ACTIVITY_CLASS_SYMBOLS_V1 = [
  "UNKNOWN",
  "NATIVE_TRANSFER",
  "ERC20_ACTIVITY",
  "ERC721_ACTIVITY",
  "ERC1155_ACTIVITY",
  "CONTRACT_INTERACTION",
] as const;

export type ActivityClassV1 =
  (typeof ActivityClass)[keyof typeof ActivityClass];
export type ActivityClassJsonV1 = (typeof ACTIVITY_CLASS_SYMBOLS_V1)[number];

export const ActivityClassV1Schema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const ActivityClassJsonV1Schema = z.enum(ACTIVITY_CLASS_SYMBOLS_V1);

export const Element = { FIRE: 0, WATER: 1, WIND: 2 } as const;
export const ELEMENT_SYMBOLS_V1 = ["FIRE", "WATER", "WIND"] as const;
export type ElementV1 = (typeof Element)[keyof typeof Element];
export type ElementJsonV1 = (typeof ELEMENT_SYMBOLS_V1)[number];
export const ElementV1Schema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);
export const ElementJsonV1Schema = z.enum(ELEMENT_SYMBOLS_V1);

export const Rarity = {
  COMMON: 0,
  RARE: 1,
  EPIC: 2,
  LEGENDARY: 3,
} as const;
export const RARITY_SYMBOLS_V1 = [
  "COMMON",
  "RARE",
  "EPIC",
  "LEGENDARY",
] as const;
export type RarityV1 = (typeof Rarity)[keyof typeof Rarity];
export type RarityJsonV1 = (typeof RARITY_SYMBOLS_V1)[number];
export const RarityV1Schema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const RarityJsonV1Schema = z.enum(RARITY_SYMBOLS_V1);

export const StatProfile = {
  OFFENSIVE: 0,
  BALANCED: 1,
  DEFENSIVE: 2,
} as const;
export type StatProfileV1 = (typeof StatProfile)[keyof typeof StatProfile];
export const StatProfileV1Schema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);

export const SPECIES_REGISTRY_V1 = [
  {
    id: 1,
    code: "NULL_WISP",
    displayName: "Null Wisp",
    assetId: "SPECIES_01_V1",
  },
  {
    id: 2,
    code: "ECHO_MIMIC",
    displayName: "Echo Mimic",
    assetId: "SPECIES_02_V1",
  },
  {
    id: 3,
    code: "COURIER_BEAST",
    displayName: "Courier Beast",
    assetId: "SPECIES_03_V1",
  },
  {
    id: 4,
    code: "VAULT_HORN",
    displayName: "Vault Horn",
    assetId: "SPECIES_04_V1",
  },
  {
    id: 5,
    code: "LEDGER_SLIME",
    displayName: "Ledger Slime",
    assetId: "SPECIES_05_V1",
  },
  {
    id: 6,
    code: "TOKEN_GOLEM",
    displayName: "Token Golem",
    assetId: "SPECIES_06_V1",
  },
  {
    id: 7,
    code: "RELIC_LYNX",
    displayName: "Relic Lynx",
    assetId: "SPECIES_07_V1",
  },
  {
    id: 8,
    code: "PRISM_STAG",
    displayName: "Prism Stag",
    assetId: "SPECIES_08_V1",
  },
  {
    id: 9,
    code: "SWARM_BEETLE",
    displayName: "Swarm Beetle",
    assetId: "SPECIES_09_V1",
  },
  {
    id: 10,
    code: "MOSAIC_HYDRA",
    displayName: "Mosaic Hydra",
    assetId: "SPECIES_10_V1",
  },
  {
    id: 11,
    code: "BYTE_IMP",
    displayName: "Byte Imp",
    assetId: "SPECIES_11_V1",
  },
  {
    id: 12,
    code: "CIRCUIT_DRAKE",
    displayName: "Circuit Drake",
    assetId: "SPECIES_12_V1",
  },
] as const;

export type SpeciesIdV1 = (typeof SPECIES_REGISTRY_V1)[number]["id"];
export type SpeciesCodeV1 = (typeof SPECIES_REGISTRY_V1)[number]["code"];
export const SpeciesIdV1Schema = z.number().int().min(1).max(12);
export const SpeciesCodeV1Schema = z.enum(
  SPECIES_REGISTRY_V1.map(({ code }) => code) as [
    SpeciesCodeV1,
    ...SpeciesCodeV1[],
  ],
);
