import { HttpRequest } from '@azure/functions';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/http/errors';
import { parseId, readJsonBody } from '../../src/http/requestParsing';

describe('parseId', () => {
  it('accepts positive whole numbers that fit SQL INT', () => {
    expect(parseId('1')).toBe(1);
    expect(parseId('2147483647')).toBe(2147483647);
  });

  it.each(['0', '-1', '1.5', 'abc', '', ' 7', '2147483648', '1e3'])('rejects "%s"', (value) => {
    expect(() => parseId(value)).toThrow(ValidationError);
  });

  it('rejects a missing value and names the field', () => {
    expect(() => parseId(undefined, 'departmentId')).toThrow('departmentId must be a positive whole number.');
    expect(() => parseId(null)).toThrow(ValidationError);
  });
});

describe('readJsonBody', () => {
  const post = (body?: string) =>
    new HttpRequest({ method: 'POST', url: 'http://localhost/api/employees', body: body === undefined ? undefined : { string: body } });

  it('parses a JSON body', async () => {
    await expect(readJsonBody(post('{"firstName":"Ada"}'))).resolves.toEqual({ firstName: 'Ada' });
  });

  it('rejects an empty body', async () => {
    await expect(readJsonBody(post(''))).rejects.toThrow('A JSON request body is required.');
  });

  it('rejects malformed JSON with a 400, not a crash', async () => {
    await expect(readJsonBody(post('{"firstName":'))).rejects.toThrow(ValidationError);
  });
});
