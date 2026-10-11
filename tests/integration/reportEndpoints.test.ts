/**
 * Report endpoints over the fixture. The report values themselves are covered in reports.test.ts;
 * these tests check the HTTP layer: status, response shape and the { items, count } wrapper.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bonusPercentage,
  bonusRanking,
  departmentsBonusOverAverageSalary,
  employeesWithoutBonus,
  topEarner,
  totalBonus,
} from '../../src/functions/reports';
import { httpRequest, invocationContext } from './http';
import { resetFixture } from './testDatabase';

const get = (handler: typeof totalBonus, path: string) => handler(httpRequest('GET', `reports/${path}`), invocationContext());

beforeAll(resetFixture);

describe('report endpoints', () => {
  it('GET /reports/total-bonus returns a single total', async () => {
    expect(await get(totalBonus, 'total-bonus')).toEqual({ status: 200, jsonBody: { totalBonus: 110201 } });
  });

  it.each([
    ['employees-without-bonus', employeesWithoutBonus, 3],
    ['bonus-percentage', bonusPercentage, 7],
    ['departments-bonus-over-avg-salary', departmentsBonusOverAverageSalary, 1],
    ['bonus-ranking', bonusRanking, 10],
  ] as const)('GET /reports/%s returns { items, count }', async (path, handler, expectedCount) => {
    const response = await get(handler, path);
    expect(response.status).toBe(200);
    const body = response.jsonBody as { items: unknown[]; count: number };
    expect(body.count).toBe(expectedCount);
    expect(body.items).toHaveLength(expectedCount);
  });

  it('GET /reports/top-earner answers both parts of the question', async () => {
    const response = await get(topEarner, 'top-earner');
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      highestSalary: 100000,
      highestTotalCompensation: 100000,
      topSalaryEmployees: [{ employeeId: 6, hasHighestTotalCompensation: true }],
    });
  });
});
