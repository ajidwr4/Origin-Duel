import { z } from "zod";
import {
  Rfc3339UtcV1Schema,
  UuidV1Schema,
  WalletAddressSchema,
} from "../primitives/index.js";
import { Signature65V1Schema } from "./scalars.js";

export const AuthChallengeRequestV1Schema = z.strictObject({
  walletAddress: WalletAddressSchema,
});

export const AuthChallengeResponseV1Schema = z.strictObject({
  challengeId: UuidV1Schema,
  walletAddress: WalletAddressSchema,
  message: z.string().min(1),
  expiresAt: Rfc3339UtcV1Schema,
});

export const AuthVerifyRequestV1Schema = z.strictObject({
  challengeId: UuidV1Schema,
  signature: Signature65V1Schema,
});

export const AuthVerifyResponseV1Schema = z.strictObject({
  walletAddress: WalletAddressSchema,
  expiresAt: Rfc3339UtcV1Schema,
});

export type AuthChallengeRequestV1 = z.infer<
  typeof AuthChallengeRequestV1Schema
>;
export type AuthChallengeResponseV1 = z.infer<
  typeof AuthChallengeResponseV1Schema
>;
export type AuthVerifyRequestV1 = z.infer<typeof AuthVerifyRequestV1Schema>;
export type AuthVerifyResponseV1 = z.infer<typeof AuthVerifyResponseV1Schema>;
