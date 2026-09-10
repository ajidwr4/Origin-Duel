import type { Kysely } from "kysely";
import { sql } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DbOrTrx,
  lockAuthChallenge,
  lockAuthSession,
  lockCurrentAssetAttempt,
  lockCurrentCaptureMint,
  lockMatch,
  lockPlayerProfile,
  lockSourceJob,
} from "./lock-order.ts";
import { withRetryableDbTransaction } from "./retry.ts";
import type { OriginDuelDatabase } from "./schema.ts";
import {
  POSTGRES_TEST_IMAGE,
  type PostgresTestHarness,
  startPostgres,
} from "./testing/postgres-container.ts";

/**
 * DB-03 forced concurrency evidence on real PostgreSQL 16 via Testcontainers.
 * Every retryable abort here is genuinely forced by PostgreSQL (40P01 by
 * reversed row-lock acquisition, 40001 by SERIALIZABLE conflicting writes) —
 * not synthesized exceptions. maxRetries=3 is an explicit TEST CONFIG value;
 * production DB_DEADLOCK_RETRY_MAX remains deployment-owned (TBD_DEPLOYMENT).
 */
const TEST_MAX_RETRIES = 3; // TEST CONFIG ONLY — not a production invariant.

const WALLET = new Uint8Array(20).fill(0xab);
const TX_HASH = new Uint8Array(32).fill(0x11);
const KEY32 = new Uint8Array(32).fill(0x33);
const DNA32 = new Uint8Array(32).fill(0x55);
const HASH32 = new Uint8Array(32).fill(0x66);
const NOW = new Date();
const LATER = new Date(NOW.getTime() + 60_000);

let harness: PostgresTestHarness | undefined;
let pool: pg.Pool | undefined;
let db: Kysely<OriginDuelDatabase> | undefined;

const uuid = (byte: number) =>
  `00000000-0000-4000-8000-${byte.toString().padStart(12, "0")}`;

const SOURCE_JOB = uuid(1);
const ATTEMPT = KEY32;
const CAPTURE_MINT = uuid(2);
const MATCH = uuid(3);
const CHALLENGE = uuid(5);

beforeAll(async () => {
  harness = await startPostgres(true);
  db = harness.db;
  pool = new pg.Pool({ connectionString: harness.uri });

  const p = pool as pg.Pool;
  await p.query(
    `INSERT INTO source_jobs (source_job_id, source_tx, claimant, current_attempt_key, current_capture_mint_id, row_version, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, NULL, 0, $4, $5)`,
    [SOURCE_JOB, Buffer.from(TX_HASH), Buffer.from(WALLET), NOW, NOW],
  );
  await p.query(
    `INSERT INTO asset_attempts (attempt_key, source_job_id, status, species_id, level, atk, def, element, rarity,
         transaction_dna, monster_hash, generation_spec_version, art_spec_version, metadata_spec_version,
         created_at, updated_at)
       VALUES ($1, $2, 'MONSTER_RESOLVED', 1, 1, 800, 1200, 0, 0, $3, $4, 1, 1, 1, $5, $6)`,
    [
      Buffer.from(ATTEMPT),
      SOURCE_JOB,
      Buffer.from(DNA32),
      Buffer.from(HASH32),
      NOW,
      NOW,
    ],
  );
  await p.query(
    `UPDATE source_jobs SET current_attempt_key = $1 WHERE source_job_id = $2`,
    [Buffer.from(ATTEMPT), SOURCE_JOB],
  );
  await p.query(
    `INSERT INTO capture_mints (capture_mint_id, source_job_id, attempt_key, lineage_no, status, created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'READY_TO_MINT', $4, $5)`,
    [CAPTURE_MINT, SOURCE_JOB, Buffer.from(ATTEMPT), NOW, NOW],
  );
  await p.query(
    `UPDATE source_jobs SET current_capture_mint_id = $1 WHERE source_job_id = $2`,
    [CAPTURE_MINT, SOURCE_JOB],
  );
  await p.query(
    `INSERT INTO matches (match_id, human_wallet, start_request_id, deck_version, status, match_version,
         match_seed, bot_policy_version, human_initial_snapshot, bot_initial_snapshot, current_state,
         created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'MATCH_CREATED', 0, $4, 'MVP_V1', $5, $6, $7, $8, $9)`,
    [
      MATCH,
      Buffer.from(WALLET),
      uuid(4),
      Buffer.from(KEY32),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      NOW,
      NOW,
    ],
  );
  await p.query(
    `INSERT INTO auth_challenges (challenge_id, wallet, nonce, message, auth_domain, auth_origin, issued_at, expires_at)
       VALUES ($1, $2, $3, 'm', 'd', 'o', $4, $5)`,
    [CHALLENGE, Buffer.from(WALLET), "a".repeat(32), NOW, LATER],
  );
  await p.query(
    `INSERT INTO auth_sessions (session_id_hash, wallet, created_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
    [Buffer.from(KEY32), Buffer.from(WALLET), NOW, LATER],
  );
}, 300_000);

afterAll(async () => {
  if (pool !== undefined) await pool.end();
  if (harness !== undefined) await harness.stop();
});

describe("M04-T03 DB-03 real PostgreSQL concurrency evidence", () => {
  it("boots exact postgres:16.15-bookworm with server major 16 and canonical migrations applied", {
    timeout: 300_000,
  }, async () => {
    expect(POSTGRES_TEST_IMAGE).toBe("postgres:16.15-bookworm");
    const version = await sql<{ current_setting: string }>`
        SELECT current_setting('server_version')
      `.execute(db as Kysely<OriginDuelDatabase>);
    expect(
      Number.parseInt(
        version.rows[0]?.current_setting.split(".")[0] ?? "0",
        10,
      ),
    ).toBe(16);

    const tables = await sql<{ table_name: string }>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      `.execute(db as Kysely<OriginDuelDatabase>);
    const appTables = tables.rows
      .map((row) => row.table_name)
      .filter((name) => !name.startsWith("kysely_migration"));
    expect(appTables).toHaveLength(12);
  });

  it("forces a real 40P01 deadlock on a raw transaction attempt", {
    timeout: 60_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE IF NOT EXISTS db03_deadlock_probe (id integer PRIMARY KEY, value integer NOT NULL)`,
    );
    await p.query(
      `INSERT INTO db03_deadlock_probe (id, value) VALUES (1, 0), (2, 0)
         ON CONFLICT (id) DO UPDATE SET value = 0`,
    );

    const a = await p.connect();
    const b = await p.connect();
    try {
      await a.query("BEGIN");
      await b.query("BEGIN");
      await a.query("UPDATE db03_deadlock_probe SET value = 1 WHERE id = 1");
      await b.query("UPDATE db03_deadlock_probe SET value = 1 WHERE id = 2");

      // Reverse-order acquisition completes the wait-for cycle; PostgreSQL
      // aborts one transaction with 40P01.
      const bPromise = b
        .query("UPDATE db03_deadlock_probe SET value = 2 WHERE id = 1")
        .catch((e) => e);
      await new Promise((r) => setTimeout(r, 150));
      const aResult = await a
        .query("UPDATE db03_deadlock_probe SET value = 2 WHERE id = 2")
        .catch((e) => e);
      const bResult = await bPromise;

      const codes = [aResult, bResult]
        .map((r) =>
          r instanceof Error ? (r as { code?: string }).code : undefined,
        )
        .filter((c): c is string => c !== undefined);
      expect(codes).toContain("40P01");
    } finally {
      await a.query("ROLLBACK").catch(() => undefined);
      await b.query("ROLLBACK").catch(() => undefined);
      a.release();
      b.release();
      await p.query(`DROP TABLE db03_deadlock_probe`);
    }
  });

  it("retry wrapper converges after forced 40P01 with exactly one committed semantic mutation and full rollback of the aborted attempt", {
    timeout: 120_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE db03_retry_probe (id integer PRIMARY KEY, increments integer NOT NULL)`,
    );
    await p.query(
      `INSERT INTO db03_retry_probe (id, increments) VALUES (1, 0), (2, 0)`,
    );

    // Adversary holds row 2, then takes row 1 while the wrapper's first
    // attempt holds row 1 and waits for row 2 → PostgreSQL breaks the cycle
    // with 40P01. The adversary rolls back immediately after the cycle so the
    // wrapper's next attempt can acquire both rows.
    const adversary = await p.connect();
    let deadlockForced = false;
    try {
      await adversary.query("BEGIN");
      await adversary.query(
        "UPDATE db03_retry_probe SET increments = increments WHERE id = 2",
      );

      let abortedWithDeadlock = false;
      await withRetryableDbTransaction(
        db as Kysely<OriginDuelDatabase>,
        { maxRetries: TEST_MAX_RETRIES },
        async (trx, meta) => {
          await sql`UPDATE db03_retry_probe SET increments = increments + 1 WHERE id = 1`.execute(
            trx,
          );
          if (meta.attempt === 0) {
            const adversaryTake = (async () => {
              await new Promise((r) => setTimeout(r, 150));
              const result = await adversary
                .query(
                  "UPDATE db03_retry_probe SET increments = increments WHERE id = 1",
                )
                .catch((e) => e);
              if (
                result instanceof Error &&
                (result as { code?: string }).code === "40P01"
              ) {
                deadlockForced = true;
              }
              // Release both rows promptly so the cycle can never re-form.
              await adversary.query("ROLLBACK").catch(() => undefined);
            })();
            try {
              await sql`UPDATE db03_retry_probe SET increments = increments + 1 WHERE id = 2`.execute(
                trx,
              );
            } catch (error) {
              if ((error as { code?: string }).code === "40P01") {
                abortedWithDeadlock = true;
              }
              throw error;
            }
            await adversaryTake;
          }
          // Semantic mutation of this operation, once per attempt.
          await sql`UPDATE db03_retry_probe SET increments = increments + 10 WHERE id = 1`.execute(
            trx,
          );
        },
      );

      expect(abortedWithDeadlock || deadlockForced).toBe(true);

      const row = await p.query(
        `SELECT increments FROM db03_retry_probe WHERE id = 1`,
      );
      // Aborted attempt rolled back completely; the committed attempt
      // applied the semantic mutation exactly once: +10 (+1 from that same
      // committed attempt) = 11.
      expect(row.rows[0].increments).toBe(11);
    } finally {
      await adversary.query("ROLLBACK").catch(() => undefined);
      adversary.release();
      await p.query(`DROP TABLE db03_retry_probe`);
    }
  });

  it("forces a real 40001 serialization abort on a SERIALIZABLE transaction", {
    timeout: 60_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE db03_serial_probe (id integer PRIMARY KEY, value integer NOT NULL)`,
    );
    await p.query(`INSERT INTO db03_serial_probe (id, value) VALUES (1, 0)`);

    const a = await p.connect();
    const b = await p.connect();
    try {
      await a.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await b.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      // Each reads the row the other will write — rw conflict both ways.
      await a.query("SELECT value FROM db03_serial_probe WHERE id = 1");
      await b.query("SELECT value FROM db03_serial_probe WHERE id = 1");
      await a.query(
        "UPDATE db03_serial_probe SET value = value + 1 WHERE id = 1",
      );
      // b's update blocks on a's row lock; a must therefore commit (or be
      // aborted) asynchronously — awaiting it here would deadlock the flow.
      const bUpdate = b
        .query("UPDATE db03_serial_probe SET value = value + 2 WHERE id = 1")
        .catch((e) => e);
      await new Promise((r) => setTimeout(r, 300));
      await a.query("COMMIT").catch((e) => e);
      const bResult = await bUpdate;
      expect((bResult as { code?: string }).code).toBe("40001");
    } finally {
      await a.query("ROLLBACK").catch(() => undefined);
      await b.query("ROLLBACK").catch(() => undefined);
      a.release();
      b.release();
      await p.query(`DROP TABLE db03_serial_probe`);
    }
  });

  it("retry wrapper converges after a forced 40001 with exactly one committed semantic mutation", {
    timeout: 120_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE db03_serial_retry_probe (id integer PRIMARY KEY, value integer NOT NULL)`,
    );
    await p.query(
      `INSERT INTO db03_serial_retry_probe (id, value) VALUES (1, 0)`,
    );

    const adversary = await p.connect();
    try {
      await withRetryableDbTransaction(
        db as Kysely<OriginDuelDatabase>,
        { maxRetries: TEST_MAX_RETRIES, isolationLevel: "serializable" },
        async (trx, meta) => {
          // Establish the SERIALIZABLE read first so the adversary's committed
          // write is a rw-conflict against this transaction → 40001 at commit.
          await sql`SELECT value FROM db03_serial_retry_probe WHERE id = 1`.execute(
            trx,
          );
          if (meta.attempt === 0) {
            // The adversary writes and commits while this transaction is open;
            // the row is not tuple-locked by the SELECT, so it never blocks.
            await adversary.query(
              "UPDATE db03_serial_retry_probe SET value = value + 1 WHERE id = 1",
            );
            await adversary.query("COMMIT");
          }
          await sql`UPDATE db03_serial_retry_probe SET value = value + 10 WHERE id = 1`.execute(
            trx,
          );
        },
      );

      const row = await p.query(
        `SELECT value FROM db03_serial_retry_probe WHERE id = 1`,
      );
      // Aborted attempt rolled back; the committed attempt applied +10
      // exactly once, on top of the adversary's committed +1.
      expect(row.rows[0].value).toBe(11);
    } finally {
      await adversary.query("ROLLBACK").catch(() => undefined);
      adversary.release();
      await p.query(`DROP TABLE db03_serial_retry_probe`);
    }
  });

  it("configured exhaustion surfaces a retryable failure without a second semantic operation", {
    timeout: 120_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE db03_exhaust_probe (id integer PRIMARY KEY, attempts integer NOT NULL)`,
    );
    await p.query(
      `INSERT INTO db03_exhaust_probe (id, attempts) VALUES (1, 0)`,
    );

    const adversary = await p.connect();
    try {
      // Every wrapper attempt reads the row, then the adversary commits a
      // conflicting write → each SERIALIZABLE attempt aborts with 40001, so
      // the budget (maxRetries=1) runs out deterministically.
      let attempts = 0;
      await expect(
        withRetryableDbTransaction(
          db as Kysely<OriginDuelDatabase>,
          { maxRetries: 1, isolationLevel: "serializable" },
          async (trx) => {
            attempts += 1;
            await sql`SELECT attempts FROM db03_exhaust_probe WHERE id = 1`.execute(
              trx,
            );
            await adversary.query(
              "UPDATE db03_exhaust_probe SET attempts = attempts WHERE id = 1",
            );
            await adversary.query("COMMIT");
            await sql`UPDATE db03_exhaust_probe SET attempts = attempts + 1 WHERE id = 1`.execute(
              trx,
            );
          },
        ),
      ).rejects.toThrow(/retry budget exhausted/);
      // Initial attempt + 1 retry = 2 total attempts, then exhaustion.
      expect(attempts).toBe(2);

      // No second semantic operation ran: nothing committed outside the
      // wrapper, the probe row keeps only the adversary's no-op writes.
      const row = await p.query(
        `SELECT attempts FROM db03_exhaust_probe WHERE id = 1`,
      );
      expect(row.rows[0].attempts).toBe(0);
    } finally {
      await adversary.query("ROLLBACK").catch(() => undefined);
      adversary.release();
      await p.query(`DROP TABLE db03_exhaust_probe`);
    }
  });

  it("rolls back every write of an aborted attempt", {
    timeout: 60_000,
  }, async () => {
    const p = pool as pg.Pool;
    await p.query(
      `CREATE TABLE db03_rollback_probe (id integer PRIMARY KEY, value integer NOT NULL)`,
    );
    await p.query(`INSERT INTO db03_rollback_probe (id, value) VALUES (1, 0)`);

    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE db03_rollback_probe SET value = 99 WHERE id = 1",
      );
      // Force a rollback: violate a constraint inside the transaction.
      await client
        .query(`INSERT INTO db03_rollback_probe (id, value) VALUES (1, 1)`)
        .catch(() => undefined);
      await client.query("COMMIT").catch((e) => {
        expect((e as { code?: string }).code).toBe("23505");
      });
      const row = await client.query(
        `SELECT value FROM db03_rollback_probe WHERE id = 1`,
      );
      expect(row.rows[0].value).toBe(0);
    } finally {
      client.release();
      await p.query(`DROP TABLE db03_rollback_probe`);
    }
  });

  it("executes the canonical lock helper order source_job → current attempt/mint child rows", {
    timeout: 60_000,
  }, async () => {
    const trx = db as DbOrTrx;
    await withRetryableDbTransaction(
      trx,
      { maxRetries: TEST_MAX_RETRIES },
      async (t) => {
        await lockSourceJob(t, SOURCE_JOB);
        await lockCurrentAssetAttempt(t, SOURCE_JOB);
        await lockCurrentCaptureMint(t, SOURCE_JOB);
      },
    );
  });

  it("executes the canonical lock helper order match → player_profile", {
    timeout: 60_000,
  }, async () => {
    const trx = db as DbOrTrx;
    await withRetryableDbTransaction(
      trx,
      { maxRetries: TEST_MAX_RETRIES },
      async (t) => {
        await lockMatch(t, MATCH);
        await lockPlayerProfile(t, WALLET);
      },
    );
  });

  it("executes the battle match lock foundation", {
    timeout: 60_000,
  }, async () => {
    const trx = db as DbOrTrx;
    await withRetryableDbTransaction(
      trx,
      { maxRetries: TEST_MAX_RETRIES },
      async (t) => {
        await lockMatch(t, MATCH);
      },
    );
  });

  it("executes the auth challenge-lock-before-session order", {
    timeout: 60_000,
  }, async () => {
    const trx = db as DbOrTrx;
    await withRetryableDbTransaction(
      trx,
      { maxRetries: TEST_MAX_RETRIES },
      async (t) => {
        await lockAuthChallenge(t, CHALLENGE);
        await lockAuthSession(t, KEY32);
      },
    );
  });
});
