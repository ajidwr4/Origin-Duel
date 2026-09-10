import { describe, expect, it, vi } from "vitest";
import {
  type DbOrTrx,
  DbRetryExhaustedError,
  isRetryableDbAbort,
  withRetryableDbTransaction,
} from "./retry.ts";

function pgAbort(code: string): Error {
  const error = new Error(`postgresql abort ${code}`);
  (error as { code?: string }).code = code;
  return error;
}

function fakeTransactionRunner(errorsThen: unknown[]) {
  const queue = [...errorsThen];
  const executeTransaction = vi.fn(async () => {
    const next = queue.shift();
    if (next !== undefined) throw next;
    return "done";
  });
  // withRetryableDbTransaction calls db.transaction().execute(body); the body
  // itself is what throws, so unwrap one level: body = executeTransaction.
  const db = {
    transaction: () => ({ execute: (body: () => Promise<string>) => body() }),
  } as unknown as DbOrTrx;
  return { db, executeTransaction };
}

describe("M04-T03 retry classification", () => {
  it("classifies 40001 serialization_failure as retryable", () => {
    expect(isRetryableDbAbort(pgAbort("40001"))).toBe(true);
  });

  it("classifies 40P01 deadlock_detected as retryable", () => {
    expect(isRetryableDbAbort(pgAbort("40P01"))).toBe(true);
  });

  it("does not classify 23505 unique_violation as retryable", () => {
    expect(isRetryableDbAbort(pgAbort("23505"))).toBe(false);
  });

  it("does not classify an arbitrary Error as retryable", () => {
    expect(isRetryableDbAbort(new Error("network blip"))).toBe(false);
  });
});

describe("M04-T03 bounded retry wrapper", () => {
  it("executes once when the first attempt succeeds", async () => {
    const { db } = fakeTransactionRunner([]);
    const calls: number[] = [];
    const result = await withRetryableDbTransaction(
      db,
      { maxRetries: 3 },
      async (_trx, meta) => {
        calls.push(meta.attempt);
        return "ok";
      },
    );
    expect(result).toBe("ok");
    expect(calls).toEqual([0]);
  });

  it("retries and succeeds within maxRetries", async () => {
    const { db } = fakeTransactionRunner([pgAbort("40P01")]);
    const attempts: number[] = [];
    const result = await withRetryableDbTransaction(
      db,
      { maxRetries: 3 },
      async (_trx, meta) => {
        attempts.push(meta.attempt);
        if (meta.attempt === 0) throw pgAbort("40P01");
        return "recovered";
      },
    );
    expect(result).toBe("recovered");
    expect(attempts).toEqual([0, 1]);
  });

  it("throws DbRetryExhaustedError after exhausting maxRetries", async () => {
    const { db } = fakeTransactionRunner([
      pgAbort("40P01"),
      pgAbort("40P01"),
      pgAbort("40P01"),
      pgAbort("40P01"),
    ]);
    const body = vi.fn(async () => {
      throw pgAbort("40P01");
    });
    await expect(
      withRetryableDbTransaction(db, { maxRetries: 3 }, body),
    ).rejects.toBeInstanceOf(DbRetryExhaustedError);
    // Initial attempt + 3 retries = 4 total attempts (TEST CONFIG maxRetries=3).
    expect(body).toHaveBeenCalledTimes(4);
  });

  it("runs exactly one total attempt when maxRetries = 0", async () => {
    const { db } = fakeTransactionRunner([pgAbort("40001")]);
    const body = vi.fn(async () => {
      throw pgAbort("40001");
    });
    await expect(
      withRetryableDbTransaction(db, { maxRetries: 0 }, body),
    ).rejects.toBeInstanceOf(DbRetryExhaustedError);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("does not replay a non-retryable error", async () => {
    const { db } = fakeTransactionRunner([pgAbort("23505")]);
    const body = vi.fn(async () => {
      throw pgAbort("23505");
    });
    await expect(
      withRetryableDbTransaction(db, { maxRetries: 3 }, body),
    ).rejects.toThrow("23505");
    expect(body).toHaveBeenCalledTimes(1);
  });
});
