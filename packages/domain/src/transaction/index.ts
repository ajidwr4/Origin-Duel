import { z } from "zod";
import {
  ActivityClassV1Schema,
  CLAIMANT_MODE_V1,
  SOURCE_PROFILE,
} from "../constants/index.js";
import { Bytes32HexV1Schema, UINT256_MAX } from "../primitives/index.js";

export * from "./transaction-classifier.js";
export * from "./transaction-dna.js";
export * from "./transaction-type2.js";

export const UINT64_MAX = (1n << 64n) - 1n;
export const BlockHeightV1Schema = z.bigint().min(0n).max(UINT64_MAX);
export const TransactionIndexV1Schema = z.bigint().min(0n).max(UINT256_MAX);
export const TransactionDNAV1Schema = Bytes32HexV1Schema;
export const SourceTxV1Schema = Bytes32HexV1Schema.refine(
  (value) => value !== `0x${"00".repeat(32)}`,
);
export const SourceProfileV1Schema = z.literal(SOURCE_PROFILE);
export const ClaimantModeV1Schema = z.literal(CLAIMANT_MODE_V1);

export const NormalizedTxV1Schema = z.strictObject({
  activityClass: ActivityClassV1Schema,
  blockHeight: BlockHeightV1Schema,
  transactionIndex: TransactionIndexV1Schema,
});

export type BlockHeightV1 = z.infer<typeof BlockHeightV1Schema>;
export type TransactionIndexV1 = z.infer<typeof TransactionIndexV1Schema>;
export type TransactionDNAV1 = z.infer<typeof TransactionDNAV1Schema>;
export type SourceTxV1 = z.infer<typeof SourceTxV1Schema>;
export type SourceProfileV1 = z.infer<typeof SourceProfileV1Schema>;
export type ClaimantModeV1 = z.infer<typeof ClaimantModeV1Schema>;
export type NormalizedTxV1 = z.infer<typeof NormalizedTxV1Schema>;
