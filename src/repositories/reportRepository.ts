/**
 * Part B compensation reports.
 *
 * Every calculation (sums, averages, percentages, salary + bonus, ranking) happens in SQL on
 * exact DECIMAL values. This file only runs the queries and shapes the rows; it never does
 * arithmetic on money in JavaScript, where numbers are binary floating point.
 *
 * Reports read the base tables and treat a NULL bonus literally as "no bonus"; the optional
 * 5% default (vw_EmployeeCompensation) is deliberately not applied here.
 */
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

const notImplemented = () => new Error('Not implemented yet (phase 7).');

/** 1. Total bonus across the company; employees with no bonus count as 0. */
export async function getTotalBonus(_log?: Logger): Promise<TotalBonusReport> {
  throw notImplemented();
}

/** 2. Employees whose bonus is NULL. A bonus of 0 is a recorded award and is not included. */
export async function getEmployeesWithoutBonus(_log?: Logger): Promise<EmployeeWithoutBonus[]> {
  throw notImplemented();
}

/** 3. Bonus as a percentage of salary for employees who have a bonus, rounded to 2 dp. */
export async function getBonusPercentages(_log?: Logger): Promise<BonusPercentage[]> {
  throw notImplemented();
}

/** 4. Departments whose total bonus (NULL as 0) is strictly greater than their average salary. */
export async function getDepartmentsWithBonusAboveAverageSalary(_log?: Logger): Promise<DepartmentBonusAboveAverageSalary[]> {
  throw notImplemented();
}

/** 5. Every employee ranked by bonus, highest first; NULL bonuses share the last rank. */
export async function getBonusRanking(_log?: Logger): Promise<BonusRank[]> {
  throw notImplemented();
}

/** 6. Highest-salary employee(s), and whether each also has the highest salary + bonus. */
export async function getTopEarners(_log?: Logger): Promise<TopEarnerReport> {
  throw notImplemented();
}
