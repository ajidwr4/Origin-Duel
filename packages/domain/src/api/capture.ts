import { z } from "zod";
import {
  AssetAttemptViewV1Schema,
  CaptureMintViewV1Schema,
  ReadyToMintPackageV1Schema,
} from "../asset/index.js";
import { ResolvedMonsterV1Schema } from "../monster/index.js";
import {
  Bytes32HexV1Schema,
  Rfc3339UtcV1Schema,
  TokenIdJsonV1Schema,
  UuidV1Schema,
  WalletAddressSchema,
} from "../primitives/index.js";
import { SourceTxV1Schema } from "../transaction/index.js";
import { ApiErrorCodeV1Schema } from "./error.js";

export const CaptureWorkflowStatusV1Schema = z.enum([
  "CHECKING_TRANSACTION",
  "WAITING_FOR_ATTESTATION",
  "GENERATING_PROOF",
  "PREFLIGHTING",
  "SOURCE_BOUND",
  "FAILED_RETRYABLE",
  "REJECTED",
]);

export const CaptureViewStateV1Schema = z.enum([
  "CHECKING_TRANSACTION",
  "WAITING_FOR_VERIFICATION_DATA",
  "PREPARING_PROOF",
  "PREPARING_MONSTER",
  "CREATING_CARD",
  "READY_TO_MINT",
  "WAITING_FOR_WALLET",
  "TRANSACTION_SUBMITTED",
  "CONFIRMING",
  "CONFIRMING_TRANSACTION_STATUS",
  "MONSTER_CREATED",
  "ACTION_NEEDED",
  "TRY_AGAIN_LATER",
  "NOT_ELIGIBLE",
]);

export const StartCaptureRequestV1Schema = z.strictObject({
  claimedTxHash: Bytes32HexV1Schema,
});
export const RetryCaptureRequestV1Schema = z.strictObject({});
export const MintAcknowledgementRequestV1Schema = z.strictObject({
  sourceTx: SourceTxV1Schema,
  attemptKey: Bytes32HexV1Schema,
  mintTxHash: Bytes32HexV1Schema,
});

export const CaptureViewV1Schema = z.strictObject({
  captureRequestRef: UuidV1Schema,
  claimedTxHash: Bytes32HexV1Schema,
  claimant: WalletAddressSchema,
  state: CaptureViewStateV1Schema,
  sourceTx: SourceTxV1Schema.optional(),
  monster: ResolvedMonsterV1Schema.optional(),
  assetAttempt: AssetAttemptViewV1Schema.optional(),
  captureMint: CaptureMintViewV1Schema.optional(),
  readyToMint: ReadyToMintPackageV1Schema.optional(),
  minted: z
    .strictObject({
      tokenId: TokenIdJsonV1Schema,
      mintTxHash: Bytes32HexV1Schema.optional(),
    })
    .optional(),
  lastErrorCode: ApiErrorCodeV1Schema.optional(),
  updatedAt: Rfc3339UtcV1Schema,
});

export type CaptureWorkflowStatusV1 = z.infer<
  typeof CaptureWorkflowStatusV1Schema
>;
export type CaptureViewStateV1 = z.infer<typeof CaptureViewStateV1Schema>;
export type StartCaptureRequestV1 = z.infer<typeof StartCaptureRequestV1Schema>;
export type RetryCaptureRequestV1 = z.infer<typeof RetryCaptureRequestV1Schema>;
export type MintAcknowledgementRequestV1 = z.infer<
  typeof MintAcknowledgementRequestV1Schema
>;
export type CaptureViewV1 = z.infer<typeof CaptureViewV1Schema>;
