import type { OriginDuelDb } from "./schema.ts";

/**
 * Thin plain transaction foundation over db.transaction().execute(...).
 * Deliberately no deadlock/serialization retry semantics here: the bounded
 * retry-safe wrapper (40001/40P01 only) lives in retry.ts and builds on this
 * foundation — plain transactions remain usable for callers that need no
 * automatic replay.
 */
export async function withDbTransaction<T>(
  db: OriginDuelDb,
  body: (trx: OriginDuelDb) => Promise<T>,
): Promise<T> {
  return db.transaction().execute((trx) => body(trx as OriginDuelDb));
}
