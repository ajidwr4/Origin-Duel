import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Kysely,
  type Migration,
  type MigrationProvider,
  Migrator,
} from "kysely/migration";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/**
 * Loads explicit reviewed migration files from src/db/migrations. The packet
 * places DB integration test files inside the same folder, so unlike Kysely's
 * default FileMigrationProvider this provider skips *.test.ts — only
 * hand-reviewed migration files may execute. Migration files are source code;
 * there is no runtime schema generation. Kysely's own bookkeeping tables
 * (kysely_migration, kysely_migration_lock) are infrastructure metadata,
 * not canonical application tables.
 */
class ExplicitMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    const files = (await fs.readdir(MIGRATIONS_DIR)).sort();
    for (const fileName of files) {
      if (
        !fileName.endsWith(".ts") ||
        fileName.endsWith(".test.ts") ||
        fileName.endsWith(".d.ts")
      ) {
        continue;
      }
      const filePath = path.join(MIGRATIONS_DIR, fileName);
      const migration = (await import(filePath)) as {
        default?: Migration;
      } & Migration;
      const migrationKey = fileName.substring(0, fileName.lastIndexOf("."));
      if (typeof migration.default?.up === "function") {
        migrations[migrationKey] = migration.default;
      } else if (typeof migration.up === "function") {
        migrations[migrationKey] = migration;
      }
    }
    return migrations;
  }
}

export function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    provider: new ExplicitMigrationProvider(),
  });
}
