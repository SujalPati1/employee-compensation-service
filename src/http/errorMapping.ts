/**
 * Converts any thrown value into an AppError with the right HTTP status.
 *
 * Request validation (zod) catches bad input first. The database constraints are a second
 * line of defence, so their violations are mapped to the same 400/422 responses rather than 500.
 */
import { AppError, BusinessRuleError, InternalError, ValidationError, type ErrorDetail } from './errors';

const SQL_CONSTRAINT_VIOLATION = 547; // raised for both CHECK and FOREIGN KEY violations
const SQL_STRING_TRUNCATED = 2628;

const CHECK_CONSTRAINT_DETAILS: Record<string, ErrorDetail> = {
  CK_Employee_Salary_Positive: { field: 'salary', issue: 'must be greater than 0' },
  CK_Employee_Bonus_NonNegative: { field: 'bonus', issue: 'must be 0 or more' },
  CK_Employee_FirstName_NotBlank: { field: 'firstName', issue: 'must not be blank' },
  CK_Employee_LastName_NotBlank: { field: 'lastName', issue: 'must not be blank' },
};

interface SqlErrorShape {
  number?: unknown;
  message?: unknown;
}

export function getSqlErrorNumber(error: unknown): number | undefined {
  const { number } = (typeof error === 'object' && error !== null ? error : {}) as SqlErrorShape;
  return typeof number === 'number' ? number : undefined;
}

/** Extracts the constraint name from a 547 message such as: ...conflicted with the CHECK constraint "CK_x". */
export function getConstraintName(error: unknown): string | undefined {
  const { message } = (typeof error === 'object' && error !== null ? error : {}) as SqlErrorShape;
  if (getSqlErrorNumber(error) !== SQL_CONSTRAINT_VIOLATION || typeof message !== 'string') return undefined;
  return /constraint "([^"]+)"/.exec(message)?.[1];
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const constraint = getConstraintName(error);
  if (constraint === 'FK_Employee_Department') {
    return new BusinessRuleError('UnknownDepartment', 'The department does not exist.', [
      { field: 'departmentId', issue: 'no department has this ID' },
    ]);
  }
  if (constraint !== undefined) {
    const detail = CHECK_CONSTRAINT_DETAILS[constraint];
    return new ValidationError('A value is outside the allowed range.', detail ? [detail] : undefined);
  }

  if (getSqlErrorNumber(error) === SQL_STRING_TRUNCATED) {
    return new ValidationError('A text value is too long.');
  }

  return new InternalError();
}
