import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createMigrator, createPgPool, destroyDb } from "./index.ts";

/**
 * Real PostgreSQL 16 integration smoke for the T01 connection/migration
 * boundary. Requires DATABASE_URL; skipped otherwise so `npm test` outside an
 * integration environment is not faked as evidence.
 */
const databaseUrl = process.env.DATABASE_URL;
const maybeDescribe = databaseUrl === undefined ? describe.skip : describe;

const pool = createPgPool();
const db = createDb(pool);
const migrator = createMigrator(db);

// 9007199254740993 = 2^53 + 1: first integer above Number.MAX_SAFE_INTEGER.
const NUMERIC_ABOVE_SAFE_INTEGER = "9007199254740993";
const BYTES_32 = new Uint8Array(32).map((_, i) => (i + 1) & 0xff);
const INSTANT = new Date("2026-09-05T12:34:56.789Z");

beforeAll(async () => {
  const { error } = await migrator.migrateToLatest();
  if (error !== undefined) throw error;
});

afterAll(async () => {
  // db.destroy() already ends the underlying pg pool it owns; do not end again.
  await destroyDb(db);
});

maybeDescribe("M04-T01 db infrastructure smoke", () => {
  it("connects to a real PostgreSQL 16 server", async () => {
    const result = await sql<{ current_setting: string }>`
      SELECT current_setting('server_version')
    `.execute(db);
    const version = result.rows[0]?.current_setting ?? "";
    expect(Number.parseInt(version.split(".")[0] ?? "0", 10)).toBe(16);

    const versionNum = await sql<{ server_version_num: string }>`
      SELECT current_setting('server_version_num') AS server_version_num
    `.execute(db);
    expect(versionNum.rows[0]?.server_version_num.startsWith("16")).toBe(true);
  });

  it("runs Pool/Kysely queries", async () => {
    const result = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(result.rows[0]?.one).toBe(1);
  });

  it("returns numeric(78,0) values losslessly without number coercion", async () => {
    const param = NUMERIC_ABOVE_SAFE_INTEGER;
    const result = await sql<{ value: string }>`
      SELECT ${param}::numeric(78,0)::text AS value
    `.execute(db);
    const value = result.rows[0]?.value;
    // Exact digit string must survive; Number() would round to 9007199254740992.
    expect(value).toBe(NUMERIC_ABOVE_SAFE_INTEGER);
    expect(Number(value)).toBe(9007199254740992);
  });

  it("roundtrips bytea byte-exactly", async () => {
    const result = await sql<{ data: Buffer }>`
      SELECT ${BYTES_32}::bytea AS data
    `.execute(db);
    expect(new Uint8Array(result.rows[0]?.data ?? [])).toEqual(BYTES_32);
  });

  it("roundtrips a timestamptz instant", async () => {
    const result = await sql<{ at: Date }>`
      SELECT ${INSTANT.toISOString()}::timestamptz AS at
    `.execute(db);
    expect(result.rows[0]?.at.toISOString()).toBe(INSTANT.toISOString());
  });

  it("discovers and executes the 0000 smoke migration", async () => {
    const executed = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(db);
    expect(executed.rows.map((row) => row.name)).toContain(
      "0000_migration_smoke",
    );
  });

  it("rolls back one migration and migrates up again", async () => {
    const down = await migrator.migrateDown();
    expect(down.error).toBeUndefined();
    const afterDown = await sql<{ count: string }>`
      SELECT count(*)::text AS count FROM kysely_migration
    `.execute(db);
    expect(afterDown.rows[0]?.count).toBe("0");

    const up = await migrator.migrateToLatest();
    expect(up.error).toBeUndefined();
    const afterUp = await sql<{ count: string }>`
      SELECT count(*)::text AS count FROM kysely_migration
    `.execute(db);
    expect(afterUp.rows[0]?.count).toBe("1");
  });

  it("creates no Origin Duel canonical application table", async () => {
    const tables = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `.execute(db);
    const names = tables.rows.map((row) => row.table_name);
    for (const name of names) {
      // Only Kysely migration bookkeeping may exist after T01.
      expect(name.startsWith("kysely_migration")).toBe(true);
    }
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
