/**
 * GET /api/health
 *
 * Anonymous on purpose: it returns no data, only whether the database answers. Calling it
 * about a minute before a demo wakes both the Function App and a paused serverless database.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withDatabase } from '../db/pool';
import { DatabaseUnavailableError } from '../http/errors';
import { ok } from '../http/responses';
import { withErrorHandling } from '../http/withErrorHandling';
import { createLogger } from '../logging/logger';

export async function healthHandler(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const log = createLogger(context);
  try {
    await withDatabase((pool) => pool.request().query('SELECT 1 AS ok'), { idempotent: true, log });
    return ok({ status: 'ok', database: 'ok' });
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;

    log.warn('health.degraded');
    return {
      status: 503,
      jsonBody: { status: 'degraded', database: 'unavailable', correlationId: context.invocationId },
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    };
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: withErrorHandling(healthHandler),
});
