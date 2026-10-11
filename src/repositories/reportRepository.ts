/**
 * Part B compensation reports.
 *
 * Every calculation (sums, averages, percentages, salary + bonus, ranking) happens in SQL on
 * exact DECIMAL values. This file only runs the queries and shapes the rows; it never does
 * arithmetic on money in JavaScript, where numbers are binary floating point.
 *
 * Reports read the base tables and treat a NULL bonus literally as "no bonus"; the optional
 * 5% default (vw_EmployeeCompensation) is deliberately not applied here.
 *
 * Expected results for the test fixture are worked out by hand in tests/fixtures/EXPECTED.md.
 */
import { withDatabase } from '../db/pool';
import type { Logger } from '../logging/logger';

export interface EmployeeName {
  employeeId: number;
  firstName: string;
  lastName: string;
}

export interface TotalBonusReport {
  totalBonus: number;
}

export interface EmployeeWithoutBonus extends EmployeeName {
  departmentId: number | null;
  departmentName: string | null;
  salary: number;
}

export interface BonusPercentage extends EmployeeName {
  salary: number;
  bonus: number;
  bonusPercentage: number;
}

export interface DepartmentBonusAboveAverageSalary {
  departmentId: number;
  departmentName: string;
  employeeCount: number;
  totalBonus: number;
  averageSalary: number;
}

export interface BonusRank extends EmployeeName {
  rank: number;
  bonus: number | null;
}

export interface EarnerSummary extends EmployeeName {
  salary: number;
  bonus: number | null;
  totalCompensation: number;
}

export interface TopSalaryEarner extends EarnerSummary {
  hasHighestTotalCompensation: boolean;
}

export interface TopEarnerReport {
  highestSalary: number | null;
  highestTotalCompensation: number | null;
  topSalaryEmployees: TopSalaryEarner[];
  topTotalCompensationEmployees: EarnerSummary[];
}

/** Runs a read-only report query; reads are always safe to retry. */
async function runReport<T>(query: string, log?: Logger): Promise<T[]> {
  const result = await withDatabase((pool) => pool.request().query<T>(query), { idempotent: true, log });
  return result.recordset;
}

/** 1. Total bonus across the company; employees with no bonus count as 0. */
export async function getTotalBonus(log?: Logger): Promise<TotalBonusReport> {
  // SUM already skips NULLs, but it returns NULL when no row has a bonus (or there are no rows).
  // The inner COALESCE states "no bonus counts as 0"; the outer one turns an empty result into 0.
  const [row] = await runReport<TotalBonusReport>(
    `SELECT CAST(COALESCE(SUM(COALESCE(Bonus, 0)), 0) AS DECIMAL(14, 2)) AS totalBonus
     FROM dbo.Employee`,
    log,
  );
  return row ?? { totalBonus: 0 };
}

/** 2. Employees whose bonus is NULL. A bonus of 0 is a recorded award and is not included. */
export async function getEmployeesWithoutBonus(log?: Logger): Promise<EmployeeWithoutBonus[]> {
  // "Bonus = NULL" is never true in SQL (NULL compared with anything is UNKNOWN); IS NULL is required.
  return runReport<EmployeeWithoutBonus>(
    `SELECT e.EmployeeID     AS employeeId,
            e.FirstName      AS firstName,
            e.LastName       AS lastName,
            e.DepartmentID   AS departmentId,
            d.DepartmentName AS departmentName,
            e.Salary         AS salary
     FROM dbo.Employee AS e
     LEFT JOIN dbo.Department AS d ON d.DepartmentID = e.DepartmentID
     WHERE e.Bonus IS NULL
     ORDER BY e.EmployeeID`,
    log,
  );
}

/** 3. Bonus as a percentage of salary for employees who have a bonus, rounded to 2 dp. */
export async function getBonusPercentages(log?: Logger): Promise<BonusPercentage[]> {
  // Employees without a bonus are excluded rather than shown as 0%. Multiplying by 100.0 keeps
  // the division in DECIMAL (no integer division), and ROUND rounds halves away from zero, so
  // 1.005 becomes 1.01. Salary > 0 is guaranteed by a CHECK constraint, so no division by zero.
  // DECIMAL(17, 2) fits the extreme case (largest bonus over a 0.01 salary) without overflow.
  return runReport<BonusPercentage>(
    `SELECT EmployeeID AS employeeId,
            FirstName  AS firstName,
            LastName   AS lastName,
            Salary     AS salary,
            Bonus      AS bonus,
            CAST(ROUND(Bonus * 100.0 / Salary, 2) AS DECIMAL(17, 2)) AS bonusPercentage
     FROM dbo.Employee
     WHERE Bonus IS NOT NULL
     ORDER BY bonusPercentage DESC, employeeId`,
    log,
  );
}

/** 4. Departments whose total bonus (NULL as 0) is strictly greater than their average salary. */
export async function getDepartmentsWithBonusAboveAverageSalary(log?: Logger): Promise<DepartmentBonusAboveAverageSalary[]> {
  // The INNER JOIN leaves out departments with no employees (they have no average salary) and
  // employees with no department. HAVING compares at full precision, before the display rounding,
  // and ">" means a department whose total bonus equals its average salary is not included.
  return runReport<DepartmentBonusAboveAverageSalary>(
    `SELECT d.DepartmentID   AS departmentId,
            d.DepartmentName AS departmentName,
            COUNT(*)         AS employeeCount,
            CAST(SUM(COALESCE(e.Bonus, 0)) AS DECIMAL(14, 2))  AS totalBonus,
            CAST(ROUND(AVG(e.Salary), 2) AS DECIMAL(12, 2))     AS averageSalary
     FROM dbo.Department AS d
     INNER JOIN dbo.Employee AS e ON e.DepartmentID = d.DepartmentID
     GROUP BY d.DepartmentID, d.DepartmentName
     HAVING SUM(COALESCE(e.Bonus, 0)) > AVG(e.Salary)
     ORDER BY d.DepartmentID`,
    log,
  );
}

/** 5. Every employee ranked by bonus, highest first; NULL bonuses share the last rank. */
export async function getBonusRanking(log?: Logger): Promise<BonusRank[]> {
  // Where NULLs sort differs between databases (SQL Server puts them last in DESC order,
  // PostgreSQL puts them first), so the CASE makes "NULLs last" explicit. RANK gives tied
  // bonuses the same rank and skips the next one (1, 2, 2, 4). RANK returns BIGINT, which the
  // driver would hand back as a string, so it is cast to INT.
  return runReport<BonusRank>(
    `SELECT CAST(RANK() OVER (ORDER BY CASE WHEN Bonus IS NULL THEN 1 ELSE 0 END, Bonus DESC) AS INT) AS [rank],
            EmployeeID AS employeeId,
            FirstName  AS firstName,
            LastName   AS lastName,
            Bonus      AS bonus
     FROM dbo.Employee
     ORDER BY [rank], employeeId`,
    log,
  );
}

interface TopEarnerRow extends EarnerSummary {
  highestSalary: number;
  highestTotalCompensation: number;
  isTopSalary: boolean;
  isTopTotalCompensation: boolean;
}

/** 6. Highest-salary employee(s), and whether each also has the highest salary + bonus. */
export async function getTopEarners(log?: Logger): Promise<TopEarnerReport> {
  // Salary + Bonus would be NULL for anyone without a bonus, silently removing them from the
  // comparison, so the bonus is COALESCEd to 0. Ties are kept: everyone who matches the highest
  // value is returned. The query returns each employee who is top by either measure, with flags.
  const rows = await runReport<TopEarnerRow>(
    `WITH Compensation AS (
         SELECT EmployeeID, FirstName, LastName, Salary, Bonus,
                CAST(Salary + COALESCE(Bonus, 0) AS DECIMAL(13, 2)) AS TotalCompensation
         FROM dbo.Employee
     ),
     Highest AS (
         SELECT MAX(Salary) AS HighestSalary, MAX(TotalCompensation) AS HighestTotalCompensation
         FROM Compensation
     )
     SELECT c.EmployeeID        AS employeeId,
            c.FirstName         AS firstName,
            c.LastName          AS lastName,
            c.Salary            AS salary,
            c.Bonus             AS bonus,
            c.TotalCompensation AS totalCompensation,
            h.HighestSalary            AS highestSalary,
            h.HighestTotalCompensation AS highestTotalCompensation,
            CAST(CASE WHEN c.Salary = h.HighestSalary THEN 1 ELSE 0 END AS BIT)                       AS isTopSalary,
            CAST(CASE WHEN c.TotalCompensation = h.HighestTotalCompensation THEN 1 ELSE 0 END AS BIT) AS isTopTotalCompensation
     FROM Compensation AS c
     CROSS JOIN Highest AS h
     WHERE c.Salary = h.HighestSalary OR c.TotalCompensation = h.HighestTotalCompensation
     ORDER BY c.EmployeeID`,
    log,
  );

  const summary = ({ employeeId, firstName, lastName, salary, bonus, totalCompensation }: TopEarnerRow): EarnerSummary => ({
    employeeId,
    firstName,
    lastName,
    salary,
    bonus,
    totalCompensation,
  });

  return {
    highestSalary: rows[0]?.highestSalary ?? null,
    highestTotalCompensation: rows[0]?.highestTotalCompensation ?? null,
    topSalaryEmployees: rows
      .filter((row) => row.isTopSalary)
      .map((row) => ({ ...summary(row), hasHighestTotalCompensation: row.isTopTotalCompensation })),
    topTotalCompensationEmployees: rows.filter((row) => row.isTopTotalCompensation).map(summary),
  };
}
