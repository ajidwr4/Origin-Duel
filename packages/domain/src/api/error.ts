import { z } from "zod";
import { UuidV1Schema } from "../primitives/index.js";
import { MatchVersionV1Schema, NonNegativeIntegerV1Schema } from "./scalars.js";

export const API_ERROR_CATEGORIES = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "NOT_READY",
  "AUTHORITATIVE_REJECTION",
  "CONFLICT",
  "STALE_STATE",
  "RETRYABLE_DEPENDENCY",
  "RETRYABLE_INTERNAL",
  "RESULT_UNKNOWN",
  "TERMINAL_FAILURE",
] as const;

export const API_ERROR_CODES_V1 = [
  "REQUEST_INVALID",
  "AUTH_REQUIRED",
  "AUTH_CHALLENGE_NOT_FOUND",
  "AUTH_CHALLENGE_EXPIRED",
  "AUTH_CHALLENGE_USED",
  "AUTH_SIGNATURE_INVALID",
  "RESOURCE_NOT_FOUND",
  "CAPTURE_NOT_READY",
  "CAPTURE_UNSUPPORTED_TX_PROFILE",
  "CAPTURE_INVALID_CLAIMANT",
  "CAPTURE_FAILED_SOURCE_TX",
  "CAPTURE_BELOW_GENESIS",
  "CAPTURE_CLAIMED_HASH_MISMATCH",
  "CAPTURE_SOURCE_REJECTED",
  "CAPTURE_COOLDOWN_ACTIVE",
  "CAPTURE_PROOF_UNAVAILABLE",
  "CAPTURE_PROOF_FAILED",
  "CAPTURE_ASSET_APPROVAL_INVALID",
  "CAPTURE_ASSET_APPROVAL_EXPIRED",
  "CAPTURE_RETRY_NOT_ALLOWED",
  "CAPTURE_MINT_RESULT_UNKNOWN",
  "CAPTURE_MINT_ACK_CONFLICT",
  "COLLECTION_SCAN_FAILED",
  "DECK_INVALID_SIZE",
  "DECK_DUPLICATE_TOKEN",
  "DECK_OWNERSHIP_INVALID",
  "DECK_VERSION_STALE",
  "MATCH_START_CONFLICT",
  "MATCH_NOT_FOUND",
  "MATCH_NOT_ACTIVE",
  "MATCH_VERSION_STALE",
  "BATTLE_ACTION_INVALID",
  "BATTLE_ACTION_ILLEGAL",
  "BATTLE_HIDDEN_STATE_CORRUPT",
  "PROFILE_SETTLEMENT_CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export const ApiErrorCategorySchema = z.enum(API_ERROR_CATEGORIES);
export const ApiErrorCodeV1Schema = z.enum(API_ERROR_CODES_V1);
export const ApiErrorResponseV1Schema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeV1Schema,
    category: ApiErrorCategorySchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    requestId: UuidV1Schema,
    meta: z
      .strictObject({
        currentMatchVersion: MatchVersionV1Schema.optional(),
        retryAfterSeconds: NonNegativeIntegerV1Schema.optional(),
      })
      .optional(),
  }),
});

export type ApiErrorCategory = z.infer<typeof ApiErrorCategorySchema>;
export type ApiErrorCodeV1 = z.infer<typeof ApiErrorCodeV1Schema>;
export type ApiErrorResponseV1 = z.infer<typeof ApiErrorResponseV1Schema>;
