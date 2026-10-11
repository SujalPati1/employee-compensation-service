/**
 * Part B reports against the fixture (tests/fixtures/fixture.sql).
 * Every expected value is worked out by hand in tests/fixtures/EXPECTED.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDatabase } from '../../src/db/pool';
import {
  getBonusPercentages,
  getBonusRanking,
  getDepartmentsWithBonusAboveAverageSalary,
  getEmployeesWithoutBonus,
  getTopEarners,
  getTotalBonus,
} from '../../src/repositories/reportRepository';
import { resetFixture } from './testDatabase';

describe('reports on the fixture data', () => {
  beforeAll(resetFixture);

  describe('1. total bonus', () => {
    it('adds every bonus and counts NULL bonuses as 0', async () => {
      expect(await getTotalBonus()).toEqual({ totalBonus: 110201 });
    });
  });

  describe('2. employees who have never received a bonus', () => {
    it('lists only NULL bonuses; a recorded bonus of 0 (Max) is not "never received"', async () => {
      expect(await getEmployeesWithoutBonus()).toEqual([
        { employeeId: 2, firstName: 'Eve', lastName: 'Alpha-Two', departmentId: 1, departmentName: 'Alpha', salary: 50000 },
        { employeeId: 6, firstName: 'Ivy', lastName: 'Gamma-One', departmentId: 3, departmentName: 'Gamma', salary: 100000 },
        { employeeId: 7, firstName: 'Jon', lastName: 'Gamma-Two', departmentId: 3, departmentName: 'Gamma', salary: 20000 },
      ]);
    });
  });

  describe('3. bonus as a percentage of salary', () => {
    it('covers only employees with a bonus, rounded to 2 dp, highest first', async () => {
      const rows = await getBonusPercentages();
      expect(rows.map((r) => [r.employeeId, r.bonusPercentage])).toEqual([
        [1, 133.33], // Dan: bonus larger than salary
        [4, 50],
        [5, 50],
        [3, 25],
        [8, 11.11],
        [9, 1.01], // Lia: 1.005 rounds up in exact decimal maths (a JS float would give 1.00)
        [10, 0], // Max: a bonus of 0 is still a bonus
      ]);
    });

    it('excludes employees with no bonus rather than showing them as 0%', async () => {
      const ids = (await getBonusPercentages()).map((r) => r.employeeId);
      expect(ids).not.toContain(2);
      expect(ids).not.toContain(6);
      expect(ids).not.toContain(7);
    });

    it('returns salary and bonus alongside the percentage', async () => {
      const lia = (await getBonusPercentages()).find((r) => r.employeeId === 9);
      expect(lia).toEqual({ employeeId: 9, firstName: 'Lia', lastName: 'NoDept-Two', salary: 20000, bonus: 201, bonusPercentage: 1.01 });
    });
  });

  describe('4. departments whose total bonus exceeds their average salary', () => {
    it('returns Alpha only: Beta is exactly equal, Gamma has only NULL bonuses, Delta is empty', async () => {
      expect(await getDepartmentsWithBonusAboveAverageSalary()).toEqual([
        { departmentId: 1, departmentName: 'Alpha', employeeCount: 3, totalBonus: 50000, averageSalary: 40000 },
      ]);
    });
  });

  describe('5. ranking by bonus', () => {
    it('ranks everyone, shares ranks on ties, and puts NULL bonuses last instead of dropping them', async () => {
      const rows = await getBonusRanking();
      expect(rows.map((r) => [r.rank, r.employeeId, r.bonus])).toEqual([
        [1, 1, 40000],
        [2, 4, 30000],
        [3, 5, 20000],
        [4, 3, 10000],
        [4, 8, 10000],
        [6, 9, 201],
        [7, 10, 0],
        [8, 2, null],
        [8, 6, null],
        [8, 7, null],
      ]);
    });

    it('includes names for display', async () => {
      expect((await getBonusRanking())[0]).toEqual({ rank: 1, employeeId: 1, firstName: 'Dan', lastName: 'Alpha-One', bonus: 40000 });
    });
  });

  describe('6. highest salary and highest total compensation', () => {
    it('finds Ivy as highest salary and confirms she also ties for highest total compensation', async () => {
      expect(await getTopEarners()).toEqual({
        highestSalary: 100000,
        highestTotalCompensation: 100000,
        topSalaryEmployees: [
          {
            employeeId: 6,
            firstName: 'Ivy',
            lastName: 'Gamma-One',
            salary: 100000,
            bonus: null,
            totalCompensation: 100000, // NULL bonus counted as 0, not NULL
            hasHighestTotalCompensation: true,
          },
        ],
        topTotalCompensationEmployees: [
          { employeeId: 6, firstName: 'Ivy', lastName: 'Gamma-One', salary: 100000, bonus: null, totalCompensation: 100000 },
          { employeeId: 8, firstName: 'Kai', lastName: 'NoDept-One', salary: 90000, bonus: 10000, totalCompensation: 100000 },
        ],
      });
    });
  });
});

describe('reports with very large totals', () => {
  // 101 employees with the largest allowed bonus: the total (about 1.01 trillion) no longer fits
  // DECIMAL(14, 2), which the totals were once cast to (SQL error 8115, a 500 from the API).
  beforeAll(async () => {
    await withDatabase(
      (pool) =>
        pool.request().batch(`
          INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Salary, Bonus)
          SELECT TOP (101) 'Big', 'Bonus', 4, 9999999999.99, 9999999999.99
          FROM sys.all_objects`),
      { idempotent: false },
    );
  });
  afterAll(resetFixture);

  it('adds up the company total without overflowing', async () => {
    // Fixture total 110,201.00 + 101 × 9,999,999,999.99
    expect(await getTotalBonus()).toEqual({ totalBonus: 1010000110199.99 });
  });

  it('adds up a department total without overflowing', async () => {
    const delta = (await getDepartmentsWithBonusAboveAverageSalary()).find((row) => row.departmentId === 4);
    expect(delta).toMatchObject({ employeeCount: 101, totalBonus: 1009999999998.99, averageSalary: 9999999999.99 });
  });
});

describe('reports with no employees', () => {
  beforeAll(async () => {
    await withDatabase((pool) => pool.request().batch('DELETE FROM dbo.Employee'), { idempotent: true });
  });
  afterAll(resetFixture);

  it('total bonus is 0, not NULL', async () => {
    expect(await getTotalBonus()).toEqual({ totalBonus: 0 });
  });

  it('list reports are empty', async () => {
    expect(await getEmployeesWithoutBonus()).toEqual([]);
    expect(await getBonusPercentages()).toEqual([]);
    expect(await getDepartmentsWithBonusAboveAverageSalary()).toEqual([]);
    expect(await getBonusRanking()).toEqual([]);
  });

  it('top earner report has no values', async () => {
    expect(await getTopEarners()).toEqual({
      highestSalary: null,
      highestTotalCompensation: null,
      topSalaryEmployees: [],
      topTotalCompensationEmployees: [],
    });
  });
});
