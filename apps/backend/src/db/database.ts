import { Kysely, PostgresDialect } from "kysely";
import type { Pool } from "pg";
import type { OriginDuelDatabase, OriginDuelDb } from "./schema.ts";

/**
 * Kysely boundary over one explicitly owned pg Pool. The caller supplies the
 * Pool (config.ts factory or test harness) and is responsible for ending it;
 * destroyDb only closes the Kysely instance it created.
 */
export function createDb(pool: Pool): OriginDuelDb {
  return new Kysely<OriginDuelDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}

/** Clean close path for the Kysely instance created by createDb. */
export async function destroyDb(db: OriginDuelDb): Promise<void> {
  await db.destroy();
}
