import { describe, expect, it } from "vitest";
import {
  DOMAIN_ELEMENT,
  DOMAIN_LEVEL,
  DOMAIN_RARITY,
  DOMAIN_SPECIES,
  DOMAIN_STAT_ALLOCATION,
} from "../constants/index.js";
import type { WalletAddress } from "../primitives/index.js";
import {
  activityClassFromDnaV1,
  assertEncodedTransactionResourceV1,
  bindCanonicalSourceTxV1,
  type ClassifierLogV1,
  classifyTransactionV1,
  deriveCanonicalSourceTxV1,
  deriveTransactionDnaV1,
  domainSampleV1,
  entropySeedFromDnaV1,
  reconstructSignedType2V1,
  TRANSFER_BATCH_EVENT_TOPIC,
  TRANSFER_EVENT_TOPIC,
  TRANSFER_SINGLE_EVENT_TOPIC,
  type Type2TransactionV1,
} from "./index.js";
import { keccak256 } from "./keccak.js";

const ACTOR = "0x1111111111111111111111111111111111111111" as WalletAddress;
const OTHER = "0x2222222222222222222222222222222222222222" as WalletAddress;
const topicAddress = (address: WalletAddress) =>
  `0x${"0".repeat(24)}${address.slice(2)}`;
const word = (value: bigint) => value.toString(16).padStart(64, "0");

const TYPE2: Type2TransactionV1 = {
  txType: 2,
  chainId: 11_155_111n,
  nonce: 7n,
  maxPriorityFeePerGas: 1_000_000_000n,
  maxFeePerGas: 2_000_000_000n,
  gasLimit: 21_000n,
  to: ACTOR,
  value: 123_456_789n,
  input: "0x",
  accessList: [],
  yParity: 1,
  r: 0x1234n,
  s: 0x5678n,
};

const EXPECTED_RAW =
  "0x02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678";
const EXPECTED_SOURCE =
  "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab";

function classify(logs: readonly ClassifierLogV1[], overrides = {}) {
  return classifyTransactionV1({
    sourceActor: ACTOR,
    hasTo: true,
    value: 0n,
    input: "0x",
    logs,
    ...overrides,
  });
}

describe("canonical Type-2 reconstruction", () => {
  it("reproduces the frozen raw transaction and sourceTx", () => {
    expect(reconstructSignedType2V1(TYPE2)).toBe(EXPECTED_RAW);
    expect(deriveCanonicalSourceTxV1(TYPE2)).toBe(EXPECTED_SOURCE);
    expect(bindCanonicalSourceTxV1(TYPE2, EXPECTED_SOURCE)).toBe(
      EXPECTED_SOURCE,
    );
    expect(() =>
      bindCanonicalSourceTxV1(TYPE2, `0x${"00".repeat(32)}`),
    ).toThrow("canonical transaction hash mismatch");
  });

  it("uses Ethereum Keccak-256", () => {
    expect(keccak256("0x")).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("encodes zero integers, contract creation, and r/s minimally", () => {
    const raw = reconstructSignedType2V1({
      ...TYPE2,
      nonce: 0n,
      to: null,
      value: 0n,
      input: "0x00",
      yParity: 0,
      r: 1n,
      s: 0x80n,
    });
    expect(raw).toMatch(/825208808000c080018180$/);
  });

  it.each([
    { txType: 1 },
    { chainId: 1n },
    { accessList: [{}] },
    { yParity: 2 },
    { to: "0x1111" },
    { nonce: -1n },
    { r: 1n << 256n },
  ])("rejects an unsupported or malformed profile", (patch) => {
    expect(() =>
      reconstructSignedType2V1({ ...TYPE2, ...patch } as Type2TransactionV1),
    ).toThrow();
  });
});

describe("TransactionDNA", () => {
  const frozen = deriveTransactionDnaV1({
    activityClass: 3,
    blockHeight: 6_000_000n,
    transactionIndex: 42n,
  });

  it("reproduces the frozen DNA fixture and named samples", () => {
    expect(frozen).toEqual({
      entropyDigest:
        "0x2dc4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      entropyPayload:
        "0xc4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      transactionDNA:
        "0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
      entropySeed:
        "0x00c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
    });
    expect(
      [
        DOMAIN_LEVEL,
        DOMAIN_ELEMENT,
        DOMAIN_SPECIES,
        DOMAIN_RARITY,
        DOMAIN_STAT_ALLOCATION,
      ].map((domain) => domainSampleV1(frozen.entropySeed, domain, 0n)),
    ).toEqual([
      "0x51ecad2a428a282ac9399965a62fd9e1c127cd87bc5bca9d664dba68d6aca753",
      "0x90f57f3ff3567349e5baa4573a63b08cec7ef95ed4a26ee3d01c5891d7077096",
      "0x30f589a8a9bea66b8ff7a15ada62efc75c89f00d66f0ca0686c9ff56ee9e24e0",
      "0x8e07002a46e0195350d8993e2da775b091057cee24e06099c137e700554f835c",
      "0x20ccc8654b90ae24f179eabdf16cb7d2aeb4b7577feb5de92544cc4949695987",
    ]);
  });

  it("isolates activityClass from entropy and non-species samples", () => {
    const other = deriveTransactionDnaV1({
      activityClass: 1,
      blockHeight: 6_000_000n,
      transactionIndex: 42n,
    });
    expect(other.entropySeed).toBe(frozen.entropySeed);
    expect(other.transactionDNA.slice(4)).toBe(frozen.transactionDNA.slice(4));
    expect(activityClassFromDnaV1(other.transactionDNA)).toBe(1);
    expect(entropySeedFromDnaV1(other.transactionDNA)).toBe(frozen.entropySeed);
    expect(domainSampleV1(other.entropySeed, DOMAIN_LEVEL, 0n)).toBe(
      domainSampleV1(frozen.entropySeed, DOMAIN_LEVEL, 0n),
    );
  });
});

describe("bounded classifier", () => {
  const erc20 = {
    topics: [TRANSFER_EVENT_TOPIC, topicAddress(ACTOR), topicAddress(OTHER)],
    data: `0x${word(1n)}`,
  } as const;
  const erc721 = {
    topics: [
      TRANSFER_EVENT_TOPIC,
      topicAddress(ACTOR),
      topicAddress(OTHER),
      word(1n),
    ],
    data: "0x",
  } as const;
  const erc1155Single = {
    topics: [
      TRANSFER_SINGLE_EVENT_TOPIC,
      topicAddress(OTHER),
      topicAddress(ACTOR),
      topicAddress(OTHER),
    ],
    data: `0x${word(1n)}${word(2n)}`,
  } as const;
  const erc1155Batch = {
    topics: [
      TRANSFER_BATCH_EVENT_TOPIC,
      topicAddress(OTHER),
      topicAddress(ACTOR),
      topicAddress(OTHER),
    ],
    data: `0x${word(64n)}${word(128n)}${word(1n)}${word(7n)}${word(1n)}${word(9n)}`,
  } as const;

  it("recognizes complete canonical event shapes", () => {
    expect(classify([erc20])).toBe(2);
    expect(classify([erc721])).toBe(3);
    expect(classify([erc1155Single])).toBe(4);
    expect(classify([erc1155Batch])).toBe(4);
  });

  it("resolves mixed evidence independently of log order", () => {
    expect(classify([erc20, erc721])).toBe(5);
    expect(classify([erc721, erc20])).toBe(5);
  });

  it("applies native, contract, and unknown fallbacks exactly", () => {
    expect(classify([], { value: 1n })).toBe(1);
    expect(classify([], { value: 0n })).toBe(0);
    expect(classify([], { input: "0x01" })).toBe(5);
    expect(classify([], { hasTo: false })).toBe(5);
    expect(classify([{ topics: [], data: "0x" }])).toBe(5);
  });

  it("enforces whole-receipt and per-log resource behavior", () => {
    expect(classify(Array.from({ length: 64 }, () => erc20))).toBe(2);
    expect(classify(Array.from({ length: 65 }, () => erc20))).toBe(5);
    const oversized = {
      topics: erc20.topics,
      data: `0x${"00".repeat(8193)}`,
    } as const;
    expect(classify([oversized, erc721])).toBe(3);
  });

  it("rejects malformed address topics and TransferBatch layouts", () => {
    expect(
      classify([
        {
          ...erc20,
          topics: [
            TRANSFER_EVENT_TOPIC,
            `0x01${"00".repeat(31)}`,
            topicAddress(OTHER),
          ],
        },
      ]),
    ).toBe(5);
    expect(
      classify([
        {
          ...erc1155Batch,
          data: `0x${word(96n)}${word(128n)}${word(1n)}${word(7n)}${word(1n)}${word(9n)}`,
        },
      ]),
    ).toBe(5);
    expect(
      classify([
        {
          ...erc1155Batch,
          data: `0x${word(64n)}${word((1n << 256n) - 1n)}${word(1n)}${word(7n)}`,
        },
      ]),
    ).toBe(5);
  });

  it("enforces encoded transaction and log-data boundaries", () => {
    expect(() =>
      assertEncodedTransactionResourceV1(new Uint8Array(65_536)),
    ).not.toThrow();
    expect(() =>
      assertEncodedTransactionResourceV1(new Uint8Array(65_537)),
    ).toThrow();
    const boundary = {
      topics: erc20.topics,
      data: `0x${"00".repeat(8192)}`,
    } as const;
    expect(classify([boundary, erc721])).toBe(3);
  });
});
