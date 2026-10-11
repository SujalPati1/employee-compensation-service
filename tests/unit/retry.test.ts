import { describe, expect, it, vi } from 'vitest';
import { retry } from '../../src/db/retry';

const instantSleep = vi.fn(async () => undefined);
const transient = new Error('transient');
const permanent = new Error('permanent');
const shouldRetry = (error: unknown) => error === transient;

describe('retry', () => {
  it('returns at once when the operation succeeds', async () => {
    const operation = vi.fn(async () => 'ok');
    await expect(retry(operation, { delaysMs: [10, 20], shouldRetry, sleep: instantSleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures with the configured delays, then succeeds', async () => {
    const sleep = vi.fn(async () => undefined);
    const onRetry = vi.fn();
    const operation = vi.fn().mockRejectedValueOnce(transient).mockRejectedValueOnce(transient).mockResolvedValue('ok');

    await expect(retry(operation, { delaysMs: [10, 20, 30], shouldRetry, sleep, onRetry })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(onRetry).toHaveBeenNthCalledWith(1, transient, 1, 10);
    expect(onRetry).toHaveBeenNthCalledWith(2, transient, 2, 20);
  });

  it('stops after the last delay and throws the final error', async () => {
    const operation = vi.fn().mockRejectedValue(transient);
    await expect(retry(operation, { delaysMs: [1, 1], shouldRetry, sleep: instantSleep })).rejects.toBe(transient);
    expect(operation).toHaveBeenCalledTimes(3); // first try + 2 retries
  });

  it('never retries an error that is not retryable', async () => {
    const operation = vi.fn().mockRejectedValue(permanent);
    await expect(retry(operation, { delaysMs: [1, 1, 1], shouldRetry, sleep: instantSleep })).rejects.toBe(permanent);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
