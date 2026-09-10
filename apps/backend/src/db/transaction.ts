import type { OriginDuelDb } from "./schema.ts";

/**
 * Thin plain transaction foundation over db.transaction().execute(...).
 * Deliberately no deadlock/serialization retry semantics here; bounded retry
 * classification belongs to M04-T03.
 */
export async function withDbTransaction<T>(
  db: OriginDuelDb,
  body: (trx: OriginDuelDb) => Promise<T>,
): Promise<T> {
  return db.transaction().execute((trx) => body(trx as OriginDuelDb));
}
