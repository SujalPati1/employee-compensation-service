import type { HttpRequest } from '@azure/functions';
import { ValidationError } from './errors';

const MAX_SQL_INT = 2_147_483_647;

/** Parses an ID from the route or query string. Accepts only whole numbers that fit SQL INT. */
export function parseId(value: string | null | undefined, field = 'id'): number {
  const id = value !== null && value !== undefined && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(id) || id < 1 || id > MAX_SQL_INT) {
    throw new ValidationError(`${field} must be a positive whole number.`, [
      { field, issue: 'must be a positive whole number' },
    ]);
  }
  return id;
}

/** Reads the request body as JSON. An empty or malformed body is a 400, not a 500. */
export async function readJsonBody(request: HttpRequest): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') throw new ValidationError('A JSON request body is required.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError('The request body is not valid JSON.');
  }
}
