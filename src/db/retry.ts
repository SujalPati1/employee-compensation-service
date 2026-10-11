/**
 * Runs an operation and retries it with increasing delays while it fails with a retryable error.
 * Kept free of database code so it can be unit tested with fake errors and an instant sleep.
 */

export interface RetryOptions {
  /** Wait before each retry, in milliseconds. Its length is the maximum number of retries. */
  delaysMs: readonly number[];
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = options.delaysMs[attempt - 1];
      if (delayMs === undefined || !options.shouldRetry(error)) throw error;

      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
