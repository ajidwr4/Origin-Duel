import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, type Kysely, Migrator } from "kysely/migration";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/**
 * Kysely Migrator over explicit reviewed migration source files in
 * src/db/migrations. Migration files are hand-reviewed code; the database
 * schema changes only through these explicit files. Kysely's own bookkeeping tables
 * (kysely_migration, kysely_migration_lock) are infrastructure metadata,
 * not canonical application tables.
 */
export function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATIONS_DIR,
    }),
  });
}
