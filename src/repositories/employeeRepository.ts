/**
 * Employee data access (Part A). All SQL uses parameters; values are never concatenated in.
 *
 * Reads come from vw_EmployeeCompensation, so every employee carries both the raw bonus and the
 * read-time 5% default (effectiveBonus). Writes go to dbo.Employee.
 *
 * Names are sent as NVARCHAR so non-Latin-1 letters (e.g. "Ł") survive the trip; the UTF-8
 * column stores them correctly. Dates travel as 'YYYY-MM-DD' text in both directions, so no
 * time-zone conversion can shift them by a day.
 */
import sql from 'mssql';
import { withDatabase } from '../db/pool';
import type { Logger } from '../logging/logger';
import type { CreateEmployeeInput, UpdateEmployeeInput } from '../validation/employeeSchemas';

export interface Employee {
  employeeId: number;
  firstName: string;
  lastName: string;
  departmentId: number | null;
  departmentName: string | null;
  salary: number;
  bonus: number | null;
  hireDate: string | null;
  effectiveBonus: number;
  isDefaultBonus: boolean;
  totalCompensation: number;
  effectiveTotalCompensation: number;
}

const EMPLOYEE_COLUMNS = `
    EmployeeID                 AS employeeId,
    FirstName                  AS firstName,
    LastName                   AS lastName,
    DepartmentID               AS departmentId,
    DepartmentName             AS departmentName,
    Salary                     AS salary,
    Bonus                      AS bonus,
    CONVERT(char(10), HireDate, 23) AS hireDate,
    EffectiveBonus             AS effectiveBonus,
    IsDefaultBonus             AS isDefaultBonus,
    TotalCompensation          AS totalCompensation,
    EffectiveTotalCompensation AS effectiveTotalCompensation`;

// Maps each updatable API field to its column and SQL type. The SET clause is built only from
// these fixed names, never from request text, so it cannot be used for SQL injection.
const UPDATABLE_COLUMNS = {
  firstName: { column: 'FirstName', type: sql.NVarChar(50) },
  lastName: { column: 'LastName', type: sql.NVarChar(50) },
  departmentId: { column: 'DepartmentID', type: sql.Int },
  salary: { column: 'Salary', type: sql.Decimal(12, 2) },
  bonus: { column: 'Bonus', type: sql.Decimal(12, 2) },
  hireDate: { column: 'HireDate', type: sql.NVarChar(10) },
} as const;

export async function getEmployeeById(employeeId: number, log?: Logger): Promise<Employee | undefined> {
  const result = await withDatabase(
    (pool) =>
      pool
        .request()
        .input('employeeId', sql.Int, employeeId)
        .query<Employee>(`SELECT ${EMPLOYEE_COLUMNS} FROM dbo.vw_EmployeeCompensation WHERE EmployeeID = @employeeId`),
    { idempotent: true, log },
  );
  return result.recordset[0];
}

export async function listEmployees(filter: { departmentId?: number }, log?: Logger): Promise<Employee[]> {
  const result = await withDatabase(
    (pool) =>
      pool
        .request()
        .input('departmentId', sql.Int, filter.departmentId ?? null)
        .query<Employee>(
          `SELECT ${EMPLOYEE_COLUMNS}
           FROM dbo.vw_EmployeeCompensation
           WHERE @departmentId IS NULL OR DepartmentID = @departmentId
           ORDER BY EmployeeID`,
        ),
    { idempotent: true, log },
  );
  return result.recordset;
}

/** Inserts the employee and returns it as stored, in one round trip. An unknown department raises SQL error 547 (422). */
export async function createEmployee(input: CreateEmployeeInput, log?: Logger): Promise<Employee> {
  const result = await withDatabase(
    (pool) =>
      pool
        .request()
        .input('firstName', sql.NVarChar(50), input.firstName)
        .input('lastName', sql.NVarChar(50), input.lastName)
        .input('departmentId', sql.Int, input.departmentId ?? null)
        .input('salary', sql.Decimal(12, 2), input.salary)
        .input('bonus', sql.Decimal(12, 2), input.bonus ?? null)
        .input('hireDate', sql.NVarChar(10), input.hireDate ?? null)
        .query<Employee>(
          `DECLARE @inserted TABLE (EmployeeID INT);

           INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Salary, Bonus, HireDate)
           OUTPUT INSERTED.EmployeeID INTO @inserted
           VALUES (@firstName, @lastName, @departmentId, @salary, @bonus, CONVERT(date, @hireDate, 23));

           SELECT ${EMPLOYEE_COLUMNS}
           FROM dbo.vw_EmployeeCompensation
           WHERE EmployeeID = (SELECT EmployeeID FROM @inserted);`,
        ),
    // Not idempotent: retried only if the request never reached the database, so no duplicate rows.
    { idempotent: false, log },
  );

  const employee = result.recordset[0];
  if (!employee) throw new Error('The inserted employee could not be read back.');
  return employee;
}

/**
 * Applies a merge patch: only the fields present in `changes` are updated; null clears a field.
 * Returns undefined when the employee does not exist.
 */
export async function updateEmployee(
  employeeId: number,
  changes: UpdateEmployeeInput,
  log?: Logger,
): Promise<Employee | undefined> {
  const result = await withDatabase(
    (pool) => {
      const request = pool.request().input('employeeId', sql.Int, employeeId);
      const assignments: string[] = [];

      for (const [field, { column, type }] of Object.entries(UPDATABLE_COLUMNS)) {
        if (!(field in changes)) continue;
        const value = changes[field as keyof UpdateEmployeeInput] ?? null;
        request.input(field, type, value);
        assignments.push(field === 'hireDate' ? `${column} = CONVERT(date, @${field}, 23)` : `${column} = @${field}`);
      }

      return request.query<Employee>(
        `UPDATE dbo.Employee SET ${assignments.join(', ')} WHERE EmployeeID = @employeeId;

         SELECT ${EMPLOYEE_COLUMNS} FROM dbo.vw_EmployeeCompensation WHERE EmployeeID = @employeeId;`,
      );
    },
    // Setting the same values twice has the same result, so a retry is safe.
    { idempotent: true, log },
  );
  return result.recordset[0];
}

/** Returns false when the employee does not exist. */
export async function deleteEmployee(employeeId: number, log?: Logger): Promise<boolean> {
  const result = await withDatabase(
    (pool) =>
      pool
        .request()
        .input('employeeId', sql.Int, employeeId)
        .query<{ deleted: number }>('DELETE FROM dbo.Employee WHERE EmployeeID = @employeeId; SELECT @@ROWCOUNT AS deleted;'),
    // Not marked idempotent: a retry after a delete that did succeed would wrongly report 404.
    { idempotent: false, log },
  );
  return (result.recordset[0]?.deleted ?? 0) > 0;
}
