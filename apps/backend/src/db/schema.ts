import type { Kysely } from "kysely";

/**
 * Manual hand-authored Kysely mirror types (packet §5.5 typing policy).
 * Canonical reviewed SQL migration DDL is the authority; these types only
 * mirror it and never redefine schema semantics. T02 replaces the empty
 * baseline with the exact canonical V1 table mappings.
 */

// T01 baseline: no canonical application table exists yet, so none may be
// mirrored here. T02 maps all 12 canonical tables into this type.
export type OriginDuelDatabase = Record<string, never>;

export type OriginDuelDb = Kysely<OriginDuelDatabase>;
