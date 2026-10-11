import type { HttpResponseInit } from '@azure/functions';
import { DatabaseUnavailableError, type AppError } from './errors';

export function ok(body: unknown): HttpResponseInit {
  return { status: 200, jsonBody: body };
}

export function created(body: unknown, location: string): HttpResponseInit {
  return { status: 201, jsonBody: body, headers: { Location: location } };
}

export function noContent(): HttpResponseInit {
  return { status: 204 };
}

/** The single error format used by every endpoint. Never includes stack traces or internal messages. */
export function errorResponse(error: AppError, correlationId: string): HttpResponseInit {
  return {
    status: error.status,
    jsonBody: {
      error: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      correlationId,
    },
    headers: error instanceof DatabaseUnavailableError ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
  };
}
