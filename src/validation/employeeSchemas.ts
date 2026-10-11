/**
 * Request body rules for employees, mirroring the database columns and constraints.
 * Each schema gives both runtime validation and the TypeScript type of the parsed body.
 */
import { z } from 'zod';

const MAX_MONEY = 9_999_999_999.99; // largest DECIMAL(12, 2) value
const MAX_SQL_INT = 2_147_483_647;
const MAX_NAME_BYTES = 50; // VARCHAR(50) with a UTF-8 collation holds 50 bytes, not 50 characters

const nameSchema = z
  .string()
  .trim()
  .min(1, 'must not be blank')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= MAX_NAME_BYTES,
    'is too long (50 bytes maximum; accented letters use 2 or more)',
  );

// JSON numbers print in their shortest exact form, so a value with at most two decimal
// places always prints with at most two. 0.1 + 0.2 style artefacts cannot arrive from JSON text.
const moneySchema = z
  .number()
  .max(MAX_MONEY, 'is too large')
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(String(value)), 'must have at most 2 decimal places');

const salarySchema = moneySchema.refine((value) => value > 0, 'must be greater than 0');
const bonusSchema = moneySchema.refine((value) => value >= 0, 'must be 0 or more');
const departmentIdSchema = z.number().int('must be a whole number').min(1, 'must be 1 or more').max(MAX_SQL_INT);
// The ISO format allows year 0000, but SQL Server's DATE type starts at 0001-01-01.
// ISO dates compare correctly as text, so a string comparison is enough.
const hireDateSchema = z.iso
  .date('must be a date in YYYY-MM-DD format')
  .refine((value) => value >= '0001-01-01', 'must be 0001-01-01 or later');

/** POST /employees. Unknown fields are rejected so typos such as "bonuss" are not silently ignored. */
export const createEmployeeSchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  departmentId: departmentIdSchema.nullable().optional(),
  salary: salarySchema,
  bonus: bonusSchema.nullable().optional(),
  hireDate: hireDateSchema.nullable().optional(),
});

/**
 * PATCH /employees/{id}, merge-patch rules: an absent field stays unchanged and null clears
 * a field. Only the nullable columns (departmentId, bonus, hireDate) accept null.
 */
export const updateEmployeeSchema = z
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    departmentId: departmentIdSchema.nullable().optional(),
    salary: salarySchema.optional(),
    bonus: bonusSchema.nullable().optional(),
    hireDate: hireDateSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'provide at least one field to update');

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
