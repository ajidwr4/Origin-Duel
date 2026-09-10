import { sql } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * Infrastructure-only smoke migration. It creates NO Origin Duel application
 * table; its only purpose is to prove explicit migration discovery, execution,
 * and reversal against real PostgreSQL. The harmless statement exercises the
 * migrator; it has no durable schema effect.
 */
export default {
  async up(db) {
    await sql`SELECT 1`.execute(db);
  },
  async down(db) {
    await sql`SELECT 1`.execute(db);
  },
} satisfies Migration;
