import type { Kysely } from "kysely";
import type { OriginDuelDatabase } from "./schema.ts";

/**
 * Bounded retry-safe DB transaction wrapper (Phase 12 §17.6, GS11-14).
 *
 * Only PostgreSQL transaction aborts 40001 (serialization_failure) and
 * 40P01 (deadlock_detected) are automatically retried. Every attempt is a
 * fresh full DB transaction: PostgreSQL/Kysely rolls the aborted attempt
 * back completely before the wrapper executes the next attempt. When the
 * retry budget is exhausted the wrapper throws a retryable internal-style
 * failure — never a second semantic operation outside the wrapper.
 *
 * The retry body receives only the DB transaction handle and retry metadata.
 * Irreversible external effects (wallet/chain broadcast, non-idempotent IPFS
 * upload, unsafe external signing) MUST NOT live inside the body — this
 * module must never import or call chain/wallet/IPFS/renderer/signer code.
 *
 * The production retry bound is deployment-owned (DB_DEADLOCK_RETRY_MAX,
 * still TBD_DEPLOYMENT). Callers pass maxRetries explicitly; no default
 * production value is defined here.
 */

export const SERIALIZATION_FAILURE_CODE = "40001";
export const DEADLOCK_DETECTED_CODE = "40P01";

export class DbRetryExhaustedError extends Error {
  constructor(
    public readonly lastError: unknown,
    public readonly attempts: number,
  ) {
    super(
      `DB transaction failed after ${attempts} attempt(s); retry budget exhausted (retryable)`,
    );
    this.name = "DbRetryExhaustedError";
  }
}

function retryableAbortCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return code === SERIALIZATION_FAILURE_CODE || code === DEADLOCK_DETECTED_CODE
    ? (code as string)
    : undefined;
}

/** True only for PostgreSQL retryable transaction aborts 40001/40P01. */
export function isRetryableDbAbort(error: unknown): boolean {
  return retryableAbortCode(error) !== undefined;
}

export interface RetryAttemptMeta {
  /** 0-based attempt index; 0 is the initial attempt. */
  readonly attempt: number;
}

export interface RetryDbOptions {
  /**
   * Number of retries permitted AFTER the initial attempt. The production
   * bound is deployment-owned (DB_DEADLOCK_RETRY_MAX, TBD_DEPLOYMENT);
   * tests pass an explicit test configuration value.
   */
  readonly maxRetries: number;
  /**
   * Optional Kysely transaction isolation level. Serializable callers need it
   * so PostgreSQL can genuinely abort attempts with 40001.
   */
  readonly isolationLevel?: "read committed" | "repeatable read" | "serializable";
}

type DbOrTrx = Kysely<OriginDuelDatabase>;

/**
 * Run `body` inside a DB transaction, retrying the whole transaction only
 * when PostgreSQL aborts it with 40001/40P01 and retry budget remains.
 * Non-retryable errors propagate immediately without replay.
 */
export async function withRetryableDbTransaction<T>(
  db: DbOrTrx,
  options: RetryDbOptions,
  body: (trx: DbOrTrx, meta: RetryAttemptMeta) => Promise<T>,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= options.maxRetries) {
    try {
      const builder = db.transaction();
      const tx =
        options.isolationLevel === undefined
          ? builder
          : builder.setIsolationLevel(options.isolationLevel);
      return await tx.execute((trx) => body(trx as DbOrTrx, { attempt }));
    } catch (error) {
      if (!retryableAbortCode(error)) {
        throw error;
      }
      lastError = error;
      attempt += 1;
    }
  }
  throw new DbRetryExhaustedError(lastError, attempt);
}
