import { z } from "zod";
import { TokenIdJsonV1Schema } from "../primitives/index.js";

const UINT64_MAX = (1n << 64n) - 1n;
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;

function decimalSchema(maximum: bigint) {
  return z
    .string()
    .regex(CANONICAL_DECIMAL)
    .refine((value) => BigInt(value) <= maximum);
}

export const Uint64StringV1Schema = decimalSchema(UINT64_MAX);
export const Uint256StringV1Schema = TokenIdJsonV1Schema;
export const Signature65V1Schema = z.string().regex(/^0x[0-9a-f]{130}$/);
export const MatchVersionV1Schema = z.number().int().min(0).max(2_147_483_647);
export const ActionIndexV1Schema = z.number().int().min(1).max(2_147_483_647);
export const CardInstanceIdV1Schema = z.number().int().min(1).max(30);
export const NonNegativeIntegerV1Schema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647);
export const PositiveIntegerV1Schema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

export type Uint64StringV1 = z.infer<typeof Uint64StringV1Schema>;
export type Uint256StringV1 = z.infer<typeof Uint256StringV1Schema>;
export type Signature65V1 = z.infer<typeof Signature65V1Schema>;
export type MatchVersionV1 = z.infer<typeof MatchVersionV1Schema>;
export type ActionIndexV1 = z.infer<typeof ActionIndexV1Schema>;
export type CardInstanceIdV1 = z.infer<typeof CardInstanceIdV1Schema>;
