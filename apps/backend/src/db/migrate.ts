import { createPgPool } from "./config.ts";
import { createDb } from "./database.ts";
import { createMigrator } from "./migrator.ts";

/**
 * Migration CLI entrypoint. db:migrate runs migrateToLatest; db:rollback runs
 * migrateDown exactly one migration. Any result error exits non-zero so CI and
 * operators never see a pretended success.
 */
async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "migrate" && mode !== "rollback") {
    throw new Error("usage: migrate.ts <migrate|rollback>");
  }

  const pool = createPgPool();
  const db = createDb(pool);
  try {
    const migrator = createMigrator(db);
    const { error } =
      mode === "migrate"
        ? await migrator.migrateToLatest()
        : await migrator.migrateDown();
    if (error !== undefined) {
      throw error;
    }
  } finally {
    // db.destroy() ends the underlying pg pool it owns; no second pool.end().
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
