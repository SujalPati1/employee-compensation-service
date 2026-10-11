/**
 * One shared connection pool per Functions instance, plus retry for transient failures.
 *
 * A Functions instance handles many requests, so the pool is created on first use and reused.
 * Creating one per request would open a new connection every time and, as the app scales out,
 * could exhaust the database's connection limit. The pool is kept small for the same reason.
 */
import sql from 'mssql';
import { DatabaseUnavailableError } from '../http/errors';
import type { Logger } from '../logging/logger';
import { readDatabaseSettings, toMssqlConfig } from './config';
import { retry } from './retry';
import { isConnectionError, isTransientDatabaseError } from './transientErrors';

// About 45 seconds in total: long enough for a serverless database to resume from auto-pause,
// and well under the 230-second limit Azure applies to an HTTP response.
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 15_000];
const RETRY_AFTER_SECONDS = 30;

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool({
      ...toMssqlConfig(readDatabaseSettings()),
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
      connectionTimeout: 15_000,
      requestTimeout: 30_000,
    });
    // Individual broken connections are discarded by the pool; the affected request reports its own error.
    pool.on('error', () => undefined);

    poolPromise = pool.connect().catch((error: unknown) => {
      poolPromise = undefined; // let the next request try to connect again
      throw error;
    });
  }
  return poolPromise;
}

export interface DatabaseCallOptions {
  /**
   * True when running the work twice has the same effect as running it once (reads).
   * Other work is retried only when the request never reached the database, so a retry
   * cannot apply a change twice.
   */
  idempotent: boolean;
  log?: Logger;
}

/**
 * Runs database work with the shared pool. Transient failures are retried with backoff;
 * if the database is still unavailable afterwards, a DatabaseUnavailableError (503) is thrown.
 */
export async function withDatabase<T>(
  work: (pool: sql.ConnectionPool) => Promise<T>,
  options: DatabaseCallOptions,
): Promise<T> {
  try {
    return await retry(async () => work(await getPool()), {
      delaysMs: RETRY_DELAYS_MS,
      shouldRetry: (error) => isTransientDatabaseError(error) && (options.idempotent || isConnectionError(error)),
      onRetry: (error, attempt, delayMs) => {
        const { name, number } = error as { name?: string; number?: number };
        options.log?.warn('db.retry', { attempt, delayMs, errorName: name, sqlErrorNumber: number });
      },
    });
  } catch (error) {
    if (isTransientDatabaseError(error)) throw new DatabaseUnavailableError(RETRY_AFTER_SECONDS);
    throw error;
  }
}

/** Closes the shared pool. Used by tests and scripts; the Functions host never needs it. */
export async function closePool(): Promise<void> {
  const pending = poolPromise;
  poolPromise = undefined;
  if (pending) await (await pending.catch(() => undefined))?.close();
}
