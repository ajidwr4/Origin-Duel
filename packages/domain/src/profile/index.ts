import { z } from "zod";
import { WalletAddressSchema } from "../primitives/index.js";

export const PlayerProfileViewV1Schema = z
  .strictObject({
    walletAddress: WalletAddressSchema,
    totalWins: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    playerLevel: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    ({ totalWins, playerLevel }) =>
      playerLevel === Math.floor(totalWins / 5) + 1,
    { message: "playerLevel must be derived from totalWins" },
  );

export type PlayerProfileViewV1 = z.infer<typeof PlayerProfileViewV1Schema>;

export function createPlayerProfileViewV1(
  walletAddress: z.input<typeof WalletAddressSchema>,
  totalWins = 0,
): PlayerProfileViewV1 {
  return PlayerProfileViewV1Schema.parse({
    walletAddress,
    totalWins,
    playerLevel: Math.floor(totalWins / 5) + 1,
  });
}
