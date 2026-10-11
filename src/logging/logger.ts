/**
 * Structured logging that cannot leak personal data.
 *
 * Log fields are limited to the keys in SafeLogFields. Names, salaries, bonuses, request
 * bodies, tokens and keys have no field here, so the compiler rejects any attempt to log them.
 * Add a key only if its value can never identify or describe a person's pay.
 */
import type { InvocationContext } from '@azure/functions';

export interface SafeLogFields {
  employeeId?: number;
  departmentId?: number;
  status?: number;
  errorCode?: string;
  errorName?: string;
  sqlErrorNumber?: number;
  constraint?: string;
  attempt?: number;
  delayMs?: number;
  count?: number;
}

export interface Logger {
  info(event: string, fields?: SafeLogFields): void;
  warn(event: string, fields?: SafeLogFields): void;
  error(event: string, fields?: SafeLogFields): void;
}

function format(event: string, fields: SafeLogFields = {}): string {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return [event, ...pairs].join(' ');
}

/** Logs through the Functions invocation context, so entries are correlated with the request. */
export function createLogger(context: InvocationContext): Logger {
  return {
    info: (event, fields) => context.log(format(event, fields)),
    warn: (event, fields) => context.warn(format(event, fields)),
    error: (event, fields) => context.error(format(event, fields)),
  };
}
