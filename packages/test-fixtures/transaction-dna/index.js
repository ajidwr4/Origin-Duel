import { isDeepStrictEqual } from "node:util";

export const FROZEN_TRANSACTION_DNA_V1 = Object.freeze({
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
    level: "0x51ecad2a428a282ac9399965a62fd9e1c127cd87bc5bca9d664dba68d6aca753",
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

export function parseFrozenTransactionDnaV1(value) {
  if (!isDeepStrictEqual(value, FROZEN_TRANSACTION_DNA_V1)) {
    throw new TypeError("invalid frozen TransactionDNA fixture");
  }
  return value;
}
