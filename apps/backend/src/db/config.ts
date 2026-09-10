import { Pool } from "pg";

/**
 * DATABASE_URL is the only runtime connection input (tech-stack §17, backend-owned).
 * Thrown at call time, not module import time, so importing db modules never
 * requires a configured environment.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("DATABASE_URL is required for database access");
  }
  return url;
}

/**
 * One explicitly owned pg Pool per database factory; the caller owns destruction
 * via pool.end(). No implicit global pool so tests can use isolated databases.
 */
export function createPgPool(): Pool {
  return new Pool({ connectionString: requireDatabaseUrl() });
}
