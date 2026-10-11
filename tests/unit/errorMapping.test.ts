import { describe, expect, it } from 'vitest';
import { toAppError } from '../../src/http/errorMapping';
import { DatabaseUnavailableError, NotFoundError } from '../../src/http/errors';

// Real SQL Server messages for error 547; CHECK and FOREIGN KEY share the number.
const fkViolation = {
  name: 'RequestError',
  number: 547,
  message:
    'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_Employee_Department". The conflict occurred in database "Compensation", table "dbo.Department", column \'DepartmentID\'.',
};
const checkViolation = (constraint: string) => ({
  name: 'RequestError',
  number: 547,
  message: `The INSERT statement conflicted with the CHECK constraint "${constraint}". The conflict occurred in database "Compensation", table "dbo.Employee".`,
});

describe('toAppError', () => {
  it('passes AppErrors through unchanged', () => {
    const error = new NotFoundError('Employee 9 was not found.');
    expect(toAppError(error)).toBe(error);
    expect(toAppError(new DatabaseUnavailableError(30)).status).toBe(503);
  });

  it('maps an unknown department (FK violation) to 422', () => {
    expect(toAppError(fkViolation)).toMatchObject({
      status: 422,
      code: 'UnknownDepartment',
      details: [{ field: 'departmentId', issue: 'no department has this ID' }],
    });
  });

  it('maps CHECK violations to 400 and names the field', () => {
    expect(toAppError(checkViolation('CK_Employee_Salary_Positive'))).toMatchObject({
      status: 400,
      details: [{ field: 'salary', issue: 'must be greater than 0' }],
    });
    expect(toAppError(checkViolation('CK_Employee_Bonus_NonNegative')).details).toEqual([
      { field: 'bonus', issue: 'must be 0 or more' },
    ]);
  });

  it('maps "string would be truncated" (2628) to 400', () => {
    expect(toAppError({ number: 2628, message: 'String or binary data would be truncated' }).status).toBe(400);
  });

  it('hides anything unexpected behind a generic 500', () => {
    const appError = toAppError(new Error('connection string with secret=abc'));
    expect(appError).toMatchObject({ status: 500, code: 'InternalError', message: 'An unexpected error occurred.' });
  });
});
