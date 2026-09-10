import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { createDb, createMigrator, destroyDb } from "../index.ts";

/**
 * Reusable real-PostgreSQL test harness for DB integration evidence
 * (DB-03). Boots an exact postgres:16.15-bookworm container via
 * @testcontainers/postgresql 12.1.0, applies the existing explicit M04
 * migrations, and exposes a real connection URI with deterministic cleanup.
 */
export const POSTGRES_TEST_IMAGE = "postgres:16.15-bookworm";

export interface PostgresTestHarness {
  readonly uri: string;
  readonly pool: pg.Pool;
  readonly db: ReturnType<typeof createDb>;
  readonly stop: () => Promise<void>;
}

/**
 * Start a disposable PostgreSQL 16 container. When `migrate` is true the
 * canonical migrations are applied so callers begin from the exact schema.
 */
export async function startPostgres(
  migrate = true,
): Promise<PostgresTestHarness> {
  const container = await new PostgreSqlContainer(POSTGRES_TEST_IMAGE).start();
  const uri = container.getConnectionUri();
  const pool = new pg.Pool({ connectionString: uri });
  const db = createDb(pool);

  if (migrate) {
    const migrator = createMigrator(db);
    const { error } = await migrator.migrateToLatest();
    if (error !== undefined) {
      await destroyDb(db);
      await container.stop();
      throw error;
    }
  }

  return {
    uri,
    pool,
    db,
    stop: async () => {
      await destroyDb(db);
      await container.stop();
    },
  };
}
