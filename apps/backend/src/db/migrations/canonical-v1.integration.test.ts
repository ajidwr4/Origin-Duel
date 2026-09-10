import type { Kysely } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createMigrator, destroyDb } from "../index.ts";

/**
 * Canonical V1 schema evidence on real PostgreSQL 16 (Phase 10 §§58–68).
 * Proves clean empty-DB migration to the exact 12-table schema, named
 * constraints/indexes, and SQL-boundary rejection of invalid state — the
 * database rejects, not a TypeScript validator. Requires DATABASE_URL.
 *
 * The suite provisions its own disposable database so "empty DB → migrate"
 * evidence is genuine and never races other DB suites on a shared database.
 */
const databaseUrl = process.env.DATABASE_URL;
const maybeDescribe = databaseUrl === undefined ? describe.skip : describe;

const SUITE_DB = `origin_duel_m04_t02_${Date.now().toString(36)}`;

function suiteUrl(): string {
  const url = new URL(databaseUrl as string);
  url.pathname = `/${SUITE_DB}`;
  return url.toString();
}

// Module-level init must be lazy: the suite DB only exists after beforeAll.
const pool: pg.Pool = new pg.Pool({
  connectionString: databaseUrl === undefined ? undefined : suiteUrl(),
});
const db: Kysely<unknown> = createDb(pool);
const migrator = createMigrator(db);

const WALLET = new Uint8Array(20).fill(0xab);
const WALLET2 = new Uint8Array(20).fill(0xcd);
const TX_HASH = new Uint8Array(32).fill(0x11);
const TX_HASH2 = new Uint8Array(32).fill(0x22);
const KEY32 = new Uint8Array(32).fill(0x33);
const KEY32B = new Uint8Array(32).fill(0x44);
const DNA32 = new Uint8Array(32).fill(0x55);
const HASH32 = new Uint8Array(32).fill(0x66);
const NOW = new Date();
const LATER = new Date(NOW.getTime() + 60_000);

interface PgError {
  code: string;
}

async function expectPgError(run: () => Promise<unknown>): Promise<PgError> {
  try {
    await run();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (typeof code === "string") return { code };
    throw error;
  }
  throw new Error("expected a PostgreSQL error but the statement succeeded");
}

async function insertRow(
  table: string,
  columns: Record<string, unknown>,
): Promise<void> {
  const names = Object.keys(columns);
  const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
  const values = names.map((name) =>
    columns[name] instanceof Uint8Array
      ? Buffer.from(columns[name] as Uint8Array)
      : columns[name],
  );
  await pool.query(
    `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params as never[]);
  return result.rows as T[];
}

// Provisioning (CREATE DATABASE + full migration) can exceed the 10s default
// on a cold install; the suite needs the full timeout budget.
beforeAll(async () => {
  if (databaseUrl === undefined) return;
  // CREATE DATABASE cannot run inside a transaction; use a dedicated client.
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const client = await admin.connect();
  try {
    await client.query(`CREATE DATABASE ${SUITE_DB}`);
  } finally {
    client.release();
  }
  await admin.end();

  const { error } = await migrator.migrateToLatest();
  if (error !== undefined) throw error;
}, 120_000);

afterAll(async () => {
  if (databaseUrl === undefined) return;
  await destroyDb(db);
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const client = await admin.connect();
  try {
    await client.query(`DROP DATABASE ${SUITE_DB}`);
  } finally {
    client.release();
  }
  await admin.end();
}, 60_000);

maybeDescribe("M04-T02 canonical V1 schema", () => {
  it("migrates an empty DB to exactly the 12 canonical application tables", async () => {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const appTables = rows
      .map((row) => row.table_name)
      .filter((name) => !name.startsWith("kysely_migration"))
      .sort();
    expect(appTables).toEqual([
      "asset_attempts",
      "auth_challenges",
      "auth_sessions",
      "capture_mints",
      "capture_requests",
      "deck_cards",
      "decks",
      "match_actions",
      "matches",
      "player_profiles",
      "progression_settlements",
      "source_jobs",
    ]);
  });

  it("creates the expected access-pattern indexes", async () => {
    const rows = await query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' ORDER BY indexname`,
    );
    const names = new Set(rows.map((row) => row.indexname));
    for (const expected of [
      "auth_challenges_wallet_expires_idx",
      "auth_sessions_wallet_active_idx",
      "capture_requests_claimant_updated_idx",
      "source_jobs_claimant_updated_idx",
      "asset_attempts_source_job_created_idx",
      "asset_attempts_claimable_renderer_idx",
      "capture_mints_source_lineage_idx",
      "deck_cards_token_idx",
      "matches_human_updated_idx",
      "progression_settlements_wallet_idx",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("creates all named composite FKs", async () => {
    const rows = await query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY conname`,
    );
    const names = rows.map((row) => row.conname);
    for (const expected of [
      "capture_requests_source_job_fk",
      "asset_attempts_superseded_fk",
      "source_jobs_current_attempt_fk",
      "capture_mints_attempt_source_fk",
      "source_jobs_current_capture_mint_fk",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("creates required UNIQUE constraints", async () => {
    const rows = await query<{ conname: string; def: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE contype = 'u' AND connamespace = 'public'::regnamespace`,
    );
    const defs = rows.map((row) => `${row.conname}: ${row.def}`);
    for (const fragment of [
      "claimant, claimed_tx_hash",
      "attempt_key, source_job_id",
      "source_job_id, lineage_no",
      "capture_mint_id, source_job_id",
      "human_wallet, start_request_id",
      "match_id, before_version",
      "match_id, after_version",
    ]) {
      expect(defs.some((def) => def.includes(fragment))).toBe(true);
    }
  });

  it("rejects invalid wallet/hash byte lengths", async () => {
    const err = await expectPgError(() =>
      insertRow("auth_challenges", {
        challenge_id: "00000000-0000-4000-8000-000000000001",
        wallet: new Uint8Array(19),
        nonce: "a".repeat(32),
        message: "m",
        auth_domain: "d",
        auth_origin: "o",
        issued_at: NOW,
        expires_at: LATER,
      }),
    );
    expect(err.code).toBe("23514");

    const err2 = await expectPgError(() =>
      insertRow("source_jobs", {
        source_job_id: "00000000-0000-4000-8000-000000000002",
        source_tx: new Uint8Array(31),
        claimant: WALLET,
        row_version: 0,
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(err2.code).toBe("23514");
  });

  it("rejects invalid nonce format and auth expiry order", async () => {
    const nonceErr = await expectPgError(() =>
      insertRow("auth_challenges", {
        challenge_id: "00000000-0000-4000-8000-000000000003",
        wallet: WALLET,
        nonce: "NOTHEX!".padEnd(32, "x"),
        message: "m",
        auth_domain: "d",
        auth_origin: "o",
        issued_at: NOW,
        expires_at: LATER,
      }),
    );
    expect(nonceErr.code).toBe("23514");

    const expiryErr = await expectPgError(() =>
      insertRow("auth_challenges", {
        challenge_id: "00000000-0000-4000-8000-000000000004",
        wallet: WALLET,
        nonce: "b".repeat(32),
        message: "m",
        auth_domain: "d",
        auth_origin: "o",
        issued_at: LATER,
        expires_at: NOW,
      }),
    );
    expect(expiryErr.code).toBe("23514");
  });

  it("rejects invalid capture workflow status", async () => {
    const err = await expectPgError(() =>
      insertRow("capture_requests", {
        capture_request_ref: "00000000-0000-4000-8000-000000000005",
        claimant: WALLET,
        claimed_tx_hash: TX_HASH,
        workflow_status: "BOGUS_STATUS",
        retry_count: 0,
        row_version: 0,
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(err.code).toBe("23514");
  });

  it("rejects a source_jobs.current_attempt_key pointing across source jobs", async () => {
    // Two source jobs; attempt belongs to job A, then try to bind it as job B's current.
    await insertRow("source_jobs", {
      source_job_id: "00000000-0000-4000-8000-00000000000a",
      source_tx: TX_HASH,
      claimant: WALLET,
      row_version: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    await insertRow("source_jobs", {
      source_job_id: "00000000-0000-4000-8000-00000000000b",
      source_tx: TX_HASH2,
      claimant: WALLET,
      row_version: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    await insertRow("asset_attempts", {
      attempt_key: KEY32,
      source_job_id: "00000000-0000-4000-8000-00000000000a",
      status: "MONSTER_RESOLVED",
      species_id: 1,
      level: 1,
      atk: 800,
      def: 1200,
      element: 0,
      rarity: 0,
      transaction_dna: DNA32,
      monster_hash: HASH32,
      generation_spec_version: 1,
      art_spec_version: 1,
      metadata_spec_version: 1,
      created_at: NOW,
      updated_at: NOW,
    });

    const err = await expectPgError(() =>
      pool.query(
        `UPDATE source_jobs SET current_attempt_key = $1
         WHERE source_job_id = $2`,
        [Buffer.from(KEY32), "00000000-0000-4000-8000-00000000000b"],
      ),
    );
    // Cross-source binding: no matching (attempt_key, source_job_id) pair.
    expect(err.code).toBe("23503");
  });

  it("rejects a capture_mint attempt_key from another source job", async () => {
    const err = await expectPgError(() =>
      insertRow("capture_mints", {
        capture_mint_id: "00000000-0000-4000-8000-00000000000c",
        source_job_id: "00000000-0000-4000-8000-00000000000b",
        attempt_key: KEY32,
        lineage_no: 1,
        status: "READY_TO_MINT",
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(err.code).toBe("23503");
  });

  it("rejects invalid AssetAttempt stat/power/status state", async () => {
    // level 1 requires atk+def = 2000.
    const powerErr = await expectPgError(() =>
      insertRow("asset_attempts", {
        attempt_key: KEY32B,
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        status: "MONSTER_RESOLVED",
        species_id: 1,
        level: 1,
        atk: 800,
        def: 1100,
        element: 0,
        rarity: 0,
        transaction_dna: DNA32,
        monster_hash: HASH32,
        generation_spec_version: 1,
        art_spec_version: 1,
        metadata_spec_version: 1,
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(powerErr.code).toBe("23514");

    // IMAGE_UPLOADED requires render_input_hash/image_cid/image_uri.
    const statusErr = await expectPgError(() =>
      insertRow("asset_attempts", {
        attempt_key: new Uint8Array(32).fill(0x77),
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        status: "IMAGE_UPLOADED",
        species_id: 1,
        level: 1,
        atk: 800,
        def: 1200,
        element: 0,
        rarity: 0,
        transaction_dna: DNA32,
        monster_hash: HASH32,
        generation_spec_version: 1,
        art_spec_version: 1,
        metadata_spec_version: 1,
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(statusErr.code).toBe("23514");
  });

  it("rejects invalid CaptureMint lineage/status requirements", async () => {
    // lineage_no must be >= 1.
    const lineageErr = await expectPgError(() =>
      insertRow("capture_mints", {
        capture_mint_id: "00000000-0000-4000-8000-00000000000d",
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        attempt_key: KEY32,
        lineage_no: 0,
        status: "READY_TO_MINT",
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(lineageErr.code).toBe("23514");

    // MINTED requires token_id.
    const mintedErr = await expectPgError(() =>
      insertRow("capture_mints", {
        capture_mint_id: "00000000-0000-4000-8000-00000000000e",
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        attempt_key: KEY32,
        lineage_no: 1,
        status: "MINTED",
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(mintedErr.code).toBe("23514");

    // MINT_SUBMITTING requires mint_tx_hash.
    const submittingErr = await expectPgError(() =>
      insertRow("capture_mints", {
        capture_mint_id: "00000000-0000-4000-8000-00000000000f",
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        attempt_key: KEY32,
        lineage_no: 2,
        status: "MINT_SUBMITTING",
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(submittingErr.code).toBe("23514");

    // Duplicate lineage within the same source job is unique.
    await insertRow("capture_mints", {
      capture_mint_id: "00000000-0000-4000-8000-000000000010",
      source_job_id: "00000000-0000-4000-8000-00000000000a",
      attempt_key: KEY32,
      lineage_no: 3,
      status: "READY_TO_MINT",
      created_at: NOW,
      updated_at: NOW,
    });
    const dupLineageErr = await expectPgError(() =>
      insertRow("capture_mints", {
        capture_mint_id: "00000000-0000-4000-8000-000000000011",
        source_job_id: "00000000-0000-4000-8000-00000000000a",
        attempt_key: KEY32,
        lineage_no: 3,
        status: "READY_TO_MINT",
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(dupLineageErr.code).toBe("23505");
  });

  it("rejects duplicate deck tokens and invalid positions", async () => {
    const deckId = "00000000-0000-4000-8000-000000000020";
    await insertRow("decks", {
      deck_id: deckId,
      wallet: WALLET2,
      deck_version: 1,
      created_at: NOW,
      updated_at: NOW,
    });
    const tokenId = "9007199254740993";
    await insertRow("deck_cards", {
      deck_id: deckId,
      position: 0,
      token_id: tokenId,
    });
    const dupErr = await expectPgError(() =>
      insertRow("deck_cards", {
        deck_id: deckId,
        position: 1,
        token_id: tokenId,
      }),
    );
    expect(dupErr.code).toBe("23505");

    const posErr = await expectPgError(() =>
      insertRow("deck_cards", {
        deck_id: deckId,
        position: 15,
        token_id: "2",
      }),
    );
    expect(posErr.code).toBe("23514");
  });

  it("roundtrips a numeric(78,0) token_id above the JS safe integer", async () => {
    const deckId = "00000000-0000-4000-8000-000000000021";
    await insertRow("decks", {
      deck_id: deckId,
      wallet: new Uint8Array(20).fill(0xee),
      deck_version: 1,
      created_at: NOW,
      updated_at: NOW,
    });
    const big = "9007199254740993";
    await insertRow("deck_cards", {
      deck_id: deckId,
      position: 0,
      token_id: big,
    });
    const rows = await query<{ token_id: string }>(
      `SELECT token_id::text AS token_id FROM deck_cards WHERE deck_id = $1`,
      [deckId],
    );
    expect(rows[0]?.token_id).toBe(big);
  });

  it("rejects duplicate Human+startRequestId match", async () => {
    const matchId = "00000000-0000-4000-8000-000000000030";
    const startReq = "00000000-0000-4000-8000-000000000031";
    const matchRow = {
      match_id: matchId,
      human_wallet: WALLET,
      start_request_id: startReq,
      deck_version: 1,
      status: "MATCH_CREATED",
      match_version: 0,
      match_seed: KEY32,
      bot_policy_version: "MVP_V1",
      human_initial_snapshot: JSON.stringify({}),
      bot_initial_snapshot: JSON.stringify({}),
      current_state: JSON.stringify({}),
      created_at: NOW,
      updated_at: NOW,
    };
    await insertRow("matches", matchRow);
    const dupErr = await expectPgError(() =>
      insertRow("matches", {
        ...matchRow,
        match_id: "00000000-0000-4000-8000-000000000032",
      }),
    );
    expect(dupErr.code).toBe("23505");
  });

  it("rejects invalid match terminal-field combinations", async () => {
    // Non-terminal status must keep terminal fields NULL.
    const err = await expectPgError(() =>
      insertRow("matches", {
        match_id: "00000000-0000-4000-8000-000000000033",
        human_wallet: new Uint8Array(20).fill(0x99),
        start_request_id: "00000000-0000-4000-8000-000000000034",
        deck_version: 1,
        status: "MATCH_ACTIVE",
        match_version: 0,
        match_seed: KEY32,
        bot_policy_version: "MVP_V1",
        human_initial_snapshot: JSON.stringify({}),
        bot_initial_snapshot: JSON.stringify({}),
        current_state: JSON.stringify({}),
        winner_slot: 0,
        created_at: NOW,
        updated_at: NOW,
      }),
    );
    expect(err.code).toBe("23514");
  });

  it("rejects invalid match action before/after versions and duplicates", async () => {
    const matchId = "00000000-0000-4000-8000-000000000030";
    // after_version must equal before_version + 1.
    const seqErr = await expectPgError(() =>
      insertRow("match_actions", {
        match_id: matchId,
        action_index: 1,
        actor_slot: 0,
        action_type: "MULLIGAN_ACCEPT",
        action_payload: JSON.stringify({}),
        before_version: 0,
        after_version: 2,
        created_at: NOW,
      }),
    );
    expect(seqErr.code).toBe("23514");

    await insertRow("match_actions", {
      match_id: matchId,
      action_index: 1,
      actor_slot: 0,
      action_type: "MULLIGAN_ACCEPT",
      action_payload: JSON.stringify({}),
      before_version: 0,
      after_version: 1,
      created_at: NOW,
    });
    // Duplicate before_version within one match.
    const dupErr = await expectPgError(() =>
      insertRow("match_actions", {
        match_id: matchId,
        action_index: 2,
        actor_slot: 0,
        action_type: "MULLIGAN_DECLINE",
        action_payload: JSON.stringify({}),
        before_version: 0,
        after_version: 1,
        created_at: NOW,
      }),
    );
    expect(dupErr.code).toBe("23505");
  });

  it("stores no player_level column in player_profiles", async () => {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'player_profiles'`,
    );
    expect(rows.map((row) => row.column_name).sort()).toEqual([
      "created_at",
      "total_wins",
      "updated_at",
      "wallet",
    ]);
  });

  it("rejects duplicate progression settlement match_id", async () => {
    const matchId = "00000000-0000-4000-8000-000000000030";
    await insertRow("progression_settlements", {
      match_id: matchId,
      wallet: WALLET,
      win_increment: 0,
      total_wins_after: 0,
      settled_at: NOW,
    });
    const err = await expectPgError(() =>
      insertRow("progression_settlements", {
        match_id: matchId,
        wallet: WALLET,
        win_increment: 1,
        total_wins_after: 1,
        settled_at: NOW,
      }),
    );
    expect(err.code).toBe("23505");
  });

  it("migrates down one step and back up, recreating the exact schema", {
    timeout: 120_000,
  }, async () => {
    const down = await migrator.migrateDown();
    expect(down.error).toBeUndefined();

    const afterDown = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const appTables = afterDown
      .map((row) => row.table_name)
      .filter((name) => !name.startsWith("kysely_migration"));
    expect(appTables).toEqual([]);

    const up = await migrator.migrateToLatest();
    expect(up.error).toBeUndefined();

    const afterUp = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const restored = afterUp
      .map((row) => row.table_name)
      .filter((name) => !name.startsWith("kysely_migration"))
      .sort();
    expect(restored).toHaveLength(12);
    expect(restored).toEqual([
      "asset_attempts",
      "auth_challenges",
      "auth_sessions",
      "capture_mints",
      "capture_requests",
      "deck_cards",
      "decks",
      "match_actions",
      "matches",
      "player_profiles",
      "progression_settlements",
      "source_jobs",
    ]);
  });
});
