import { HttpRequest, InvocationContext } from '@azure/functions';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailableError, ValidationError } from '../../src/http/errors';
import { withErrorHandling } from '../../src/http/withErrorHandling';

const request = new HttpRequest({ method: 'GET', url: 'http://localhost/api/test' });

function contextWithSpies() {
  const context = new InvocationContext({ invocationId: 'test-invocation-id', functionName: 'test' });
  return {
    context,
    warn: vi.spyOn(context, 'warn').mockImplementation(() => undefined),
    error: vi.spyOn(context, 'error').mockImplementation(() => undefined),
  };
}

describe('withErrorHandling', () => {
  it('returns the handler response when nothing fails', async () => {
    const { context } = contextWithSpies();
    const handler = withErrorHandling(async () => ({ status: 200, jsonBody: { ok: true } }));
    await expect(handler(request, context)).resolves.toEqual({ status: 200, jsonBody: { ok: true } });
  });

  it('turns a validation error into a 400 body with the correlation id', async () => {
    const { context, warn } = contextWithSpies();
    const handler = withErrorHandling(async () => {
      throw new ValidationError('The request body is invalid.', [{ field: 'salary', issue: 'must be greater than 0' }]);
    });

    expect(await handler(request, context)).toEqual({
      status: 400,
      jsonBody: {
        error: 'ValidationError',
        message: 'The request body is invalid.',
        details: [{ field: 'salary', issue: 'must be greater than 0' }],
        correlationId: 'test-invocation-id',
      },
      headers: undefined,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('request.rejected status=400'));
  });

  it('adds Retry-After when the database is unavailable', async () => {
    const { context } = contextWithSpies();
    const handler = withErrorHandling(async () => {
      throw new DatabaseUnavailableError(30);
    });
    const response = await handler(request, context);
    expect(response.status).toBe(503);
    expect(response.headers).toEqual({ 'Retry-After': '30' });
  });

  it('never exposes or logs the message of an unexpected error', async () => {
    const { context, error } = contextWithSpies();
    const handler = withErrorHandling(async () => {
      throw new Error('salary 150000 for Meera Iyer');
    });

    const response = await handler(request, context);
    expect(response.jsonBody).toMatchObject({ error: 'InternalError', message: 'An unexpected error occurred.' });
    expect(JSON.stringify(response)).not.toContain('Meera');
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).not.toMatch(/Meera|150000/);
  });
});
