import { z } from "zod";
import { AttestcoinProofPayloadV1Schema } from "../api/rpc.js";
import {
  Signature65V1Schema,
  Uint64StringV1Schema,
  Uint256StringV1Schema,
} from "../api/scalars.js";
import {
  Bytes32HexV1Schema,
  CIDTextV1Schema,
  IPFSUriV1Schema,
  Rfc3339UtcV1Schema,
  TokenIdJsonV1Schema,
  WalletAddressSchema,
} from "../primitives/index.js";
import { SourceTxV1Schema } from "../transaction/index.js";

export const AssetAttemptStatusV1Schema = z.enum([
  "MONSTER_RESOLVED",
  "IMAGE_UPLOADED",
  "ASSET_READY",
  "SUPERSEDED",
]);

export const CaptureMintStatusV1Schema = z.enum([
  "READY_TO_MINT",
  "WAITING_FOR_WALLET",
  "MINT_SUBMITTING",
  "RESULT_UNKNOWN",
  "CONFIRMED_FAILURE",
  "MINTED",
]);

export const AssetAttemptViewV1Schema = z.strictObject({
  attemptKey: Bytes32HexV1Schema,
  status: AssetAttemptStatusV1Schema,
  generationSpecVersion: z.literal(1),
  artSpecVersion: z.literal(1),
  metadataSpecVersion: z.literal(1),
  renderInputHash: Bytes32HexV1Schema.optional(),
  imageCID: CIDTextV1Schema.optional(),
  imageURI: IPFSUriV1Schema.optional(),
  metadataCID: CIDTextV1Schema.optional(),
  tokenURI: IPFSUriV1Schema.optional(),
});

export const TransactionReconciliationStatusV1Schema = z.enum([
  "CONFIRMED_SUCCESS",
  "CONFIRMED_FAILURE",
  "RESULT_UNKNOWN",
  "CONFIRMED_NON_INCLUDED_OR_REPLACED",
]);

export const TransactionReconciliationV1Schema = z.strictObject({
  status: TransactionReconciliationStatusV1Schema,
  mintTxHash: Bytes32HexV1Schema,
  sender: WalletAddressSchema,
  nonce: Uint256StringV1Schema,
  blockNumber: Uint64StringV1Schema.optional(),
  replacementTxHash: Bytes32HexV1Schema.optional(),
  receiptStatus: z.union([z.literal(0), z.literal(1)]).optional(),
  checkedAt: Rfc3339UtcV1Schema,
});

export const CaptureMintViewV1Schema = z.strictObject({
  status: CaptureMintStatusV1Schema,
  attemptKey: Bytes32HexV1Schema,
  mintTxHash: Bytes32HexV1Schema.optional(),
  tokenId: TokenIdJsonV1Schema.optional(),
  reconciliation: TransactionReconciliationV1Schema.optional(),
});

export const AssetApprovalV1Schema = z.strictObject({
  claimant: WalletAddressSchema,
  sourceTx: SourceTxV1Schema,
  attemptKey: Bytes32HexV1Schema,
  monsterHash: Bytes32HexV1Schema,
  tokenURI: IPFSUriV1Schema,
  generationSpecVersion: z.literal(1),
  artSpecVersion: z.literal(1),
  metadataSpecVersion: z.literal(1),
  validUntil: Uint64StringV1Schema,
});

export const SignedAssetApprovalV1Schema = z.strictObject({
  approval: AssetApprovalV1Schema,
  signature: Signature65V1Schema,
});

export const ReadyToMintPackageV1Schema = z.strictObject({
  factoryAddress: WalletAddressSchema,
  claimedTxHash: Bytes32HexV1Schema,
  sourceTx: SourceTxV1Schema,
  attemptKey: Bytes32HexV1Schema,
  proof: AttestcoinProofPayloadV1Schema,
  assetApproval: SignedAssetApprovalV1Schema,
});

export type AssetAttemptStatusV1 = z.infer<typeof AssetAttemptStatusV1Schema>;
export type CaptureMintStatusV1 = z.infer<typeof CaptureMintStatusV1Schema>;
export type AssetAttemptViewV1 = z.infer<typeof AssetAttemptViewV1Schema>;
export type TransactionReconciliationStatusV1 = z.infer<
  typeof TransactionReconciliationStatusV1Schema
>;
export type TransactionReconciliationV1 = z.infer<
  typeof TransactionReconciliationV1Schema
>;
export type CaptureMintViewV1 = z.infer<typeof CaptureMintViewV1Schema>;
export type AssetApprovalV1 = z.infer<typeof AssetApprovalV1Schema>;
export type SignedAssetApprovalV1 = z.infer<typeof SignedAssetApprovalV1Schema>;
export type ReadyToMintPackageV1 = z.infer<typeof ReadyToMintPackageV1Schema>;
