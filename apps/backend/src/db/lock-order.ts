import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { OriginDuelDatabase } from "./schema.ts";

/**
 * Normative V1 global lock order (Phase 12 §17.6 / tech-stack §10.3):
 *
 *   capture/asset:  source_job → current asset_attempt / capture_mint child rows
 *   battle:         match
 *   progression:    match → player_profile
 *   auth:           auth_challenge → session creation
 *
 * Competing code paths MUST NOT acquire the same logical rows in reverse
 * order. These helpers only take the row locks; higher-level capture/auth/
 * battle/progression service semantics live in their owning modules.
 */
export type DbOrTrx = Kysely<OriginDuelDatabase>;

/**
 * Capture/asset lane: lock the source job row first, then its current
 * attempt/mint child rows (source_job → child order).
 */
export async function lockSourceJob(
  trx: DbOrTrx,
  sourceJobId: string,
): Promise<void> {
  await sql`SELECT 1 FROM source_jobs WHERE source_job_id = ${sourceJobId} FOR UPDATE`.execute(
    trx,
  );
}

export async function lockCurrentAssetAttempt(
  trx: DbOrTrx,
  sourceJobId: string,
): Promise<void> {
  await sql`SELECT 1 FROM asset_attempts
    WHERE source_job_id = ${sourceJobId}
      AND attempt_key = (
        SELECT current_attempt_key FROM source_jobs
        WHERE source_job_id = ${sourceJobId}
      )
    FOR UPDATE`.execute(trx);
}

export async function lockCurrentCaptureMint(
  trx: DbOrTrx,
  sourceJobId: string,
): Promise<void> {
  await sql`SELECT 1 FROM capture_mints
    WHERE source_job_id = ${sourceJobId}
      AND capture_mint_id = (
        SELECT current_capture_mint_id FROM source_jobs
        WHERE source_job_id = ${sourceJobId}
      )
    FOR UPDATE`.execute(trx);
}

/** Battle lane: the match row is the primary mutable lock for one action. */
export async function lockMatch(trx: DbOrTrx, matchId: string): Promise<void> {
  await sql`SELECT 1 FROM matches WHERE match_id = ${matchId} FOR UPDATE`.execute(
    trx,
  );
}

/** Progression lane: match first, then the profile row (match → profile). */
export async function lockPlayerProfile(
  trx: DbOrTrx,
  wallet: Uint8Array,
): Promise<void> {
  await sql`SELECT 1 FROM player_profiles WHERE wallet = ${wallet} FOR UPDATE`.execute(
    trx,
  );
}

/** Auth lane: the challenge row is locked/consumed before session creation. */
export async function lockAuthChallenge(
  trx: DbOrTrx,
  challengeId: string,
): Promise<void> {
  await sql`SELECT 1 FROM auth_challenges WHERE challenge_id = ${challengeId} FOR UPDATE`.execute(
    trx,
  );
}

/** Session creation follows its challenge lock — never before it. */
export async function lockAuthSession(
  trx: DbOrTrx,
  sessionIdHash: Uint8Array,
): Promise<void> {
  await sql`SELECT 1 FROM auth_sessions WHERE session_id_hash = ${sessionIdHash} FOR UPDATE`.execute(
    trx,
  );
}
