import { z } from "zod";
import { PositiveIntegerV1Schema } from "../api/scalars.js";
import {
  Rfc3339UtcV1Schema,
  TokenIdJsonV1Schema,
} from "../primitives/index.js";

const deckItems = [
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
  TokenIdJsonV1Schema,
] as const;

export const DeckTokenIdsV1Schema = z
  .tuple(deckItems)
  .refine((tokenIds) => new Set(tokenIds).size === tokenIds.length, {
    message: "deck token IDs must be unique",
  });

export const SaveDeckRequestV1Schema = z.strictObject({
  tokenIds: DeckTokenIdsV1Schema,
});

export const DeckViewV1Schema = z.strictObject({
  deckVersion: PositiveIntegerV1Schema,
  tokenIds: DeckTokenIdsV1Schema,
  updatedAt: Rfc3339UtcV1Schema,
});

export type DeckTokenIdsV1 = z.infer<typeof DeckTokenIdsV1Schema>;
export type SaveDeckRequestV1 = z.infer<typeof SaveDeckRequestV1Schema>;
export type DeckViewV1 = z.infer<typeof DeckViewV1Schema>;
