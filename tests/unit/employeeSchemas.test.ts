import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/http/errors';
import { createEmployeeSchema, updateEmployeeSchema } from '../../src/validation/employeeSchemas';
import { parseWith } from '../../src/validation/parse';

const valid = { firstName: 'Ada', lastName: 'Lovelace', salary: 85000 };

function issuesFor(schema: typeof createEmployeeSchema | typeof updateEmployeeSchema, body: unknown) {
  try {
    parseWith(schema, body);
  } catch (error) {
    if (error instanceof ValidationError) return error.details;
    throw error;
  }
  throw new Error('expected validation to fail');
}

describe('createEmployeeSchema', () => {
  it('accepts the minimum body; bonus, department and hire date are optional', () => {
    expect(parseWith(createEmployeeSchema, valid)).toEqual(valid);
  });

  it('accepts an explicit null bonus (no bonus awarded) and a bonus of 0', () => {
    expect(parseWith(createEmployeeSchema, { ...valid, bonus: null }).bonus).toBeNull();
    expect(parseWith(createEmployeeSchema, { ...valid, bonus: 0 }).bonus).toBe(0);
  });

  it('trims names', () => {
    expect(parseWith(createEmployeeSchema, { ...valid, firstName: '  Ada  ' }).firstName).toBe('Ada');
  });

  it('requires first name, last name and salary', () => {
    expect(issuesFor(createEmployeeSchema, {})?.map((d) => d.field)).toEqual(['firstName', 'lastName', 'salary']);
  });

  it.each([0, -5])('rejects salary %d', (salary) => {
    expect(issuesFor(createEmployeeSchema, { ...valid, salary })).toContainEqual({ field: 'salary', issue: 'must be greater than 0' });
  });

  it('rejects a negative bonus', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, bonus: -1 })).toContainEqual({ field: 'bonus', issue: 'must be 0 or more' });
  });

  it('rejects more than 2 decimal places but accepts 2', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, salary: 100.123 })?.[0]?.issue).toBe('must have at most 2 decimal places');
    expect(parseWith(createEmployeeSchema, { ...valid, salary: 100.07 }).salary).toBe(100.07);
  });

  it('rejects money above DECIMAL(12,2) and numbers sent as strings', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, salary: 10_000_000_000 })?.[0]?.field).toBe('salary');
    expect(issuesFor(createEmployeeSchema, { ...valid, salary: '85000' })?.[0]?.field).toBe('salary');
  });

  it('counts name length in UTF-8 bytes to match VARCHAR(50)', () => {
    expect(parseWith(createEmployeeSchema, { ...valid, firstName: 'a'.repeat(50) }).firstName).toHaveLength(50);
    // 25 × "Ł" is 25 characters but 50 bytes: allowed. 26 is 52 bytes: rejected.
    expect(parseWith(createEmployeeSchema, { ...valid, firstName: 'Ł'.repeat(25) }).firstName).toHaveLength(25);
    expect(issuesFor(createEmployeeSchema, { ...valid, firstName: 'Ł'.repeat(26) })?.[0]?.field).toBe('firstName');
  });

  it('rejects a blank name and an invalid hire date', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, lastName: '   ' })?.[0]).toEqual({ field: 'lastName', issue: 'must not be blank' });
    expect(issuesFor(createEmployeeSchema, { ...valid, hireDate: '2024-02-30' })?.[0]?.field).toBe('hireDate');
    expect(issuesFor(createEmployeeSchema, { ...valid, hireDate: '01/02/2024' })?.[0]?.field).toBe('hireDate');
  });

  it('rejects year 0000, which SQL Server DATE cannot store, and accepts the full DATE range', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, hireDate: '0000-01-01' })?.[0]).toEqual({
      field: 'hireDate',
      issue: 'must be 0001-01-01 or later',
    });
    expect(issuesFor(updateEmployeeSchema, { hireDate: '0000-12-31' })?.[0]?.field).toBe('hireDate');
    expect(parseWith(createEmployeeSchema, { ...valid, hireDate: '0001-01-01' }).hireDate).toBe('0001-01-01');
    expect(parseWith(createEmployeeSchema, { ...valid, hireDate: '9999-12-31' }).hireDate).toBe('9999-12-31');
  });

  it('rejects unknown fields such as a misspelt "bonuss"', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, bonuss: 100 })?.[0]?.field).toBe('body');
  });

  it('rejects a department ID that is not a positive whole number', () => {
    expect(issuesFor(createEmployeeSchema, { ...valid, departmentId: 1.5 })?.[0]?.field).toBe('departmentId');
    expect(issuesFor(createEmployeeSchema, { ...valid, departmentId: 0 })?.[0]?.field).toBe('departmentId');
  });
});

describe('updateEmployeeSchema (merge patch)', () => {
  it('accepts a single field, leaving the rest out so they stay unchanged', () => {
    expect(parseWith(updateEmployeeSchema, { bonus: 2500 })).toEqual({ bonus: 2500 });
  });

  it('accepts null to clear a nullable field', () => {
    expect(parseWith(updateEmployeeSchema, { bonus: null, departmentId: null, hireDate: null })).toEqual({
      bonus: null,
      departmentId: null,
      hireDate: null,
    });
  });

  it('rejects null for required fields', () => {
    expect(issuesFor(updateEmployeeSchema, { firstName: null })?.[0]?.field).toBe('firstName');
    expect(issuesFor(updateEmployeeSchema, { salary: null })?.[0]?.field).toBe('salary');
  });

  it('rejects an empty update', () => {
    expect(issuesFor(updateEmployeeSchema, {})).toEqual([{ field: 'body', issue: 'provide at least one field to update' }]);
  });
});
