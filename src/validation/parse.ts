import type { z } from 'zod';
import { ValidationError } from '../http/errors';

/** Validates data against a schema. On failure throws a ValidationError (400) listing every problem. */
export function parseWith<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw new ValidationError(
    'The request body is invalid.',
    result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : 'body',
      issue: issue.message,
    })),
  );
}
