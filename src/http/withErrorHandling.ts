/**
 * Wraps a handler so every failure becomes the standard JSON error response and a log entry.
 * This plays the role of Express error-handling middleware, which Azure Functions does not have.
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createLogger } from '../logging/logger';
import { getConstraintName, getSqlErrorNumber, toAppError } from './errorMapping';
import { errorResponse } from './responses';

export type HttpHandler = (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

export function withErrorHandling(handler: HttpHandler): HttpHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const appError = toAppError(error);

      // Only the error's type, number and constraint are logged. Messages are left out because
      // driver messages can echo submitted values.
      const fields = {
        status: appError.status,
        errorCode: appError.code,
        errorName: error instanceof Error ? error.name : typeof error,
        sqlErrorNumber: getSqlErrorNumber(error),
        constraint: getConstraintName(error),
      };
      const log = createLogger(context);
      if (appError.status >= 500) log.error('request.failed', fields);
      else log.warn('request.rejected', fields);

      return errorResponse(appError, context.invocationId);
    }
  };
}
