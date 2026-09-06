import { z } from "zod";
import { MAX_ENCODED_TRANSACTION_BYTES_V1 } from "../constants/index.js";
import {
  Bytes32HexV1Schema,
  TokenIdJsonV1Schema,
  WalletAddressSchema,
} from "../primitives/index.js";
import { SourceTxV1Schema } from "../transaction/index.js";
import { Uint64StringV1Schema, Uint256StringV1Schema } from "./scalars.js";

const LowercaseEvenHexBytesV1Schema = z
  .string()
  .regex(/^0x(?:[0-9a-f]{2})*$/)
  .refine(
    (value) => (value.length - 2) / 2 <= MAX_ENCODED_TRANSACTION_BYTES_V1,
    `encodedTransaction must be at most ${MAX_ENCODED_TRANSACTION_BYTES_V1} bytes`,
  );

export const SepoliaAdvisoryV1Schema = z.strictObject({
  lookupStatus: z.enum(["FOUND_MINED", "FOUND_PENDING", "NOT_FOUND"]),
  claimedTxHash: Bytes32HexV1Schema,
  sender: WalletAddressSchema.optional(),
  txType: z.number().int().min(0).max(255).optional(),
  chainId: Uint256StringV1Schema.optional(),
  blockHeight: Uint64StringV1Schema.optional(),
  transactionIndex: Uint256StringV1Schema.optional(),
  nonce: Uint256StringV1Schema.optional(),
  receiptStatus: z.union([z.literal(0), z.literal(1)]).optional(),
  accessListLength: z.number().int().min(0).max(2_147_483_647).optional(),
});

export const AttestcoinMerkleSiblingV1Schema = z.strictObject({
  hash: Bytes32HexV1Schema,
  isLeft: z.boolean(),
});

export const AttestcoinProofPayloadV1Schema = z.strictObject({
  chainKey: z.literal(1),
  blockHeight: Uint64StringV1Schema,
  encodedTransaction: LowercaseEvenHexBytesV1Schema,
  merkleRoot: Bytes32HexV1Schema,
  siblings: z.array(AttestcoinMerkleSiblingV1Schema),
  lowerEndpointDigest: Bytes32HexV1Schema,
  continuityRoots: z.array(Bytes32HexV1Schema),
});

export const CreditcoinTxReceiptV1Schema = z.strictObject({
  txHash: Bytes32HexV1Schema,
  from: WalletAddressSchema,
  nonce: Uint256StringV1Schema,
  blockNumber: Uint64StringV1Schema.optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const CreditcoinStabilityV1Schema = z.enum([
  "SATISFIES_POLICY",
  "BELOW_POLICY",
  "POLICY_UNAVAILABLE_OR_UNVALIDATED",
]);

export const CreditcoinReconciliationObservationV1Schema = z.strictObject({
  replayState: z.enum(["UNUSED", "CONSUMED", "UNAVAILABLE"]),
  tokenId: TokenIdJsonV1Schema.optional(),
  nftSourceTx: SourceTxV1Schema.optional(),
  txReceipt: CreditcoinTxReceiptV1Schema.optional(),
  replacementTxHash: Bytes32HexV1Schema.optional(),
  sender: WalletAddressSchema.optional(),
  nonce: Uint256StringV1Schema.optional(),
  observedBlockNumber: Uint64StringV1Schema.optional(),
  stability: CreditcoinStabilityV1Schema,
  finalityPolicyId: z.string().min(1),
});

export const WalletBroadcastV1Schema = z.strictObject({
  txHash: Bytes32HexV1Schema,
  from: WalletAddressSchema,
  nonce: Uint256StringV1Schema.optional(),
});

export type SepoliaAdvisoryV1 = z.infer<typeof SepoliaAdvisoryV1Schema>;
export type AttestcoinMerkleSiblingV1 = z.infer<
  typeof AttestcoinMerkleSiblingV1Schema
>;
export type AttestcoinProofPayloadV1 = z.infer<
  typeof AttestcoinProofPayloadV1Schema
>;
export type CreditcoinTxReceiptV1 = z.infer<typeof CreditcoinTxReceiptV1Schema>;
export type CreditcoinStabilityV1 = z.infer<typeof CreditcoinStabilityV1Schema>;
export type CreditcoinReconciliationObservationV1 = z.infer<
  typeof CreditcoinReconciliationObservationV1Schema
>;
export type WalletBroadcastV1 = z.infer<typeof WalletBroadcastV1Schema>;
