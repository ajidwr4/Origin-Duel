import { sql } from "kysely";
import { NO_MIGRATIONS } from "kysely/migration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createMigrator, createPgPool, destroyDb } from "./index.ts";

/**
 * Real PostgreSQL 16 integration smoke for the T01 connection/migration
 * boundary. Requires DATABASE_URL; skipped otherwise so `npm test` outside an
 * integration environment is not faked as evidence.
 */
const databaseUrl = process.env.DATABASE_URL;
const maybeDescribe = databaseUrl === undefined ? describe.skip : describe;

// Lazy per-suite resources: created inside beforeAll so importing this file
// without DATABASE_URL never throws (it skips instead).
let pool: ReturnType<typeof createPgPool> | undefined;
let dbRef: ReturnType<typeof createDb> | undefined;
let migratorRef: ReturnType<typeof createMigrator> | undefined;

/** Non-null aliases valid only inside the (non-skipped) suite callbacks. */
function suiteDb(): ReturnType<typeof createDb> {
  if (dbRef === undefined) throw new Error("suite DB not initialized");
  return dbRef;
}

function suiteMigrator(): ReturnType<typeof createMigrator> {
  if (migratorRef === undefined) throw new Error("migrator not initialized");
  return migratorRef;
}

// 9007199254740993 = 2^53 + 1: first integer above Number.MAX_SAFE_INTEGER.
const NUMERIC_ABOVE_SAFE_INTEGER = "9007199254740993";
const BYTES_32 = new Uint8Array(32).map((_, i) => (i + 1) & 0xff);
const INSTANT = new Date("2026-09-05T12:34:56.789Z");

beforeAll(async () => {
  if (databaseUrl === undefined) return;
  pool = createPgPool();
  dbRef = createDb(pool);
  migratorRef = createMigrator(dbRef);
  const { error } = await migratorRef.migrateToLatest();
  if (error !== undefined) throw error;
}, 120_000);

afterAll(async () => {
  // db.destroy() already ends the underlying pg pool it owns; do not end again.
  if (dbRef !== undefined) await destroyDb(dbRef);
});

maybeDescribe("M04-T01 db infrastructure smoke", () => {
  it("connects to a real PostgreSQL 16 server", async () => {
    const result = await sql<{ current_setting: string }>`
      SELECT current_setting('server_version')
    `.execute(suiteDb());
    const version = result.rows[0]?.current_setting ?? "";
    expect(Number.parseInt(version.split(".")[0] ?? "0", 10)).toBe(16);

    const versionNum = await sql<{ server_version_num: string }>`
      SELECT current_setting('server_version_num') AS server_version_num
    `.execute(suiteDb());
    expect(versionNum.rows[0]?.server_version_num.startsWith("16")).toBe(true);
  });

  it("runs Pool/Kysely queries", async () => {
    const result = await sql<{ one: number }>`SELECT 1 AS one`.execute(
      suiteDb(),
    );
    expect(result.rows[0]?.one).toBe(1);
  });

  it("returns numeric(78,0) values losslessly without number coercion", async () => {
    const param = NUMERIC_ABOVE_SAFE_INTEGER;
    const result = await sql<{ value: string }>`
      SELECT ${param}::numeric(78,0)::text AS value
    `.execute(suiteDb());
    const value = result.rows[0]?.value;
    // Exact digit string must survive; Number() would round to 9007199254740992.
    expect(value).toBe(NUMERIC_ABOVE_SAFE_INTEGER);
    expect(Number(value)).toBe(9007199254740992);
  });

  it("roundtrips bytea byte-exactly", async () => {
    const result = await sql<{ data: Buffer }>`
      SELECT ${BYTES_32}::bytea AS data
    `.execute(suiteDb());
    expect(new Uint8Array(result.rows[0]?.data ?? [])).toEqual(BYTES_32);
  });

  it("roundtrips a timestamptz instant", async () => {
    const result = await sql<{ at: Date }>`
      SELECT ${INSTANT.toISOString()}::timestamptz AS at
    `.execute(suiteDb());
    expect(result.rows[0]?.at.toISOString()).toBe(INSTANT.toISOString());
  });

  it("discovers and executes the 0000 smoke migration", async () => {
    const executed = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(suiteDb());
    expect(executed.rows.map((row) => row.name)).toContain(
      "0000_migration_smoke",
    );
  });

  it("rolls back one migration and migrates up again", async () => {
    // migrateDown steps back exactly one migration; compare the executed
    // name sets before/after so this stays correct as later migrations land.
    const names = async () =>
      (
        await sql<{ name: string }>`
          SELECT name FROM kysely_migration
        `.execute(suiteDb())
      ).rows.map((row) => row.name);

    const before = await names();
    expect(before).toContain("0000_migration_smoke");

    const down = await suiteMigrator().migrateDown();
    expect(down.error).toBeUndefined();
    const afterDown = await names();
    expect(before.length - afterDown.length).toBe(1);
    // The newest migration was rolled back; 0000 remains the executed base.
    expect(afterDown).toEqual(before.slice(0, -1));

    const up = await suiteMigrator().migrateToLatest();
    expect(up.error).toBeUndefined();
    const afterUp = await names();
    expect(afterUp).toEqual(before);
  });

  it("creates no Origin Duel canonical application table", async () => {
    // Isolate exactly the 0000 smoke migration: roll everything back, apply
    // only 0000, verify, then restore latest so the database is left usable.
    const none = await suiteMigrator().migrateTo(NO_MIGRATIONS);
    expect(none.error).toBeUndefined();
    const only = await suiteMigrator().migrateTo("0000_migration_smoke");
    expect(only.error).toBeUndefined();

    const tables = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `.execute(suiteDb());
    const names = tables.rows.map((row) => row.table_name);
    for (const name of names) {
      // Only Kysely migration bookkeeping may exist after the smoke migration.
      expect(name.startsWith("kysely_migration")).toBe(true);
    }

    const restore = await suiteMigrator().migrateToLatest();
    expect(restore.error).toBeUndefined();
  });

  it("destroys the connection cleanly", async () => {
    // Separate pool so the main suite keeps working; proves create/destroy path.
    const pool2 = createPgPool();
    const db2 = createDb(pool2);
    const result = await sql<{ one: number }>`SELECT 1 AS one`.execute(db2);
    expect(result.rows[0]?.one).toBe(1);
    await destroyDb(db2);
  });
});
