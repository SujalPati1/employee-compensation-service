/**
 * Errors that carry an HTTP status. Anything thrown inside a handler ends up as one of these
 * (see errorMapping.ts), and withErrorHandling turns it into the standard JSON error body.
 */

export interface ErrorDetail {
  field: string;
  issue: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: the request is malformed (wrong types, missing or too-long fields, invalid id). */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super(400, 'ValidationError', message, details);
  }
}

/** 404: the requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NotFound', message);
  }
}

/** 422: the request is well-formed but breaks a business rule, e.g. an unknown department. */
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetail[]) {
    super(422, code, message, details);
  }
}

/** 503: the database is temporarily unavailable (for example resuming from auto-pause). */
export class DatabaseUnavailableError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(503, 'DatabaseUnavailable', 'The database is temporarily unavailable. Please retry shortly.');
  }
}

/** 500: anything unexpected. The message is deliberately generic; details go to the logs only. */
export class InternalError extends AppError {
  constructor() {
    super(500, 'InternalError', 'An unexpected error occurred.');
  }
}
