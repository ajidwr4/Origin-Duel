import { z } from "zod";
import { ResolvedMonsterV1Schema } from "../monster/index.js";
import {
  IPFSUriV1Schema,
  TokenIdJsonV1Schema,
  WalletAddressSchema,
  WeiAmountJsonV1Schema,
} from "../primitives/index.js";

export const ChainScanQueryV1Schema = z.strictObject({
  cursor: TokenIdJsonV1Schema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const CollectionQueryV1Schema = ChainScanQueryV1Schema;
export const MarketplaceQueryV1Schema = ChainScanQueryV1Schema;

export const MintedMonsterViewV1Schema = ResolvedMonsterV1Schema.safeExtend({
  tokenId: TokenIdJsonV1Schema,
  owner: WalletAddressSchema,
  tokenURI: IPFSUriV1Schema,
});

export const CollectionPageV1Schema = z.strictObject({
  items: z.array(MintedMonsterViewV1Schema),
  scannedCount: z.number().int().min(0).max(100),
  hasMore: z.boolean(),
  nextCursor: TokenIdJsonV1Schema.optional(),
});

export const BattleEligibilityV1Schema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("AT_LEAST_15"),
    eligibleCount: z.literal(15),
  }),
  z.strictObject({
    status: z.literal("BELOW_15"),
    eligibleCount: z.number().int().min(0).max(14),
  }),
]);

export const MarketplaceListingViewV1Schema = z.strictObject({
  tokenId: TokenIdJsonV1Schema,
  seller: WalletAddressSchema,
  price: WeiAmountJsonV1Schema,
  executable: z.boolean(),
  monster: MintedMonsterViewV1Schema.optional(),
});

export const MarketplacePageV1Schema = z.strictObject({
  items: z.array(MarketplaceListingViewV1Schema),
  scannedCount: z.number().int().min(0).max(100),
  hasMore: z.boolean(),
  nextCursor: TokenIdJsonV1Schema.optional(),
});

export type MintedMonsterViewV1 = z.infer<typeof MintedMonsterViewV1Schema>;
export type ChainScanQueryV1 = z.infer<typeof ChainScanQueryV1Schema>;
export type CollectionPageV1 = z.infer<typeof CollectionPageV1Schema>;
export type BattleEligibilityV1 = z.infer<typeof BattleEligibilityV1Schema>;
export type MarketplaceListingViewV1 = z.infer<
  typeof MarketplaceListingViewV1Schema
>;
export type MarketplacePageV1 = z.infer<typeof MarketplacePageV1Schema>;
