/**
 * Part B: compensation reports. All are read-only GET endpoints under /api/reports.
 *
 *   /total-bonus                         { totalBonus }
 *   /employees-without-bonus             { items, count }
 *   /bonus-percentage                    { items, count }
 *   /departments-bonus-over-avg-salary   { items, count }
 *   /bonus-ranking                       { items, count }
 *   /top-earner                          { highestSalary, highestTotalCompensation, topSalaryEmployees, topTotalCompensationEmployees }
 *
 * The SQL behind each report, and how it treats NULL bonuses, is in reportRepository.ts.
 */
import { app } from '@azure/functions';
import { ok } from '../http/responses';
import { withErrorHandling, type HttpHandler } from '../http/withErrorHandling';
import { createLogger, type Logger } from '../logging/logger';
import * as reports from '../repositories/reportRepository';

function listReport<T>(load: (log: Logger) => Promise<T[]>): HttpHandler {
  return withErrorHandling(async (_request, context) => {
    const items = await load(createLogger(context));
    return ok({ items, count: items.length });
  });
}

export const totalBonus = withErrorHandling(async (_request, context) => ok(await reports.getTotalBonus(createLogger(context))));
export const employeesWithoutBonus = listReport(reports.getEmployeesWithoutBonus);
export const bonusPercentage = listReport(reports.getBonusPercentages);
export const departmentsBonusOverAverageSalary = listReport(reports.getDepartmentsWithBonusAboveAverageSalary);
export const bonusRanking = listReport(reports.getBonusRanking);
export const topEarner = withErrorHandling(async (_request, context) => ok(await reports.getTopEarners(createLogger(context))));

const routes: [name: string, route: string, handler: HttpHandler][] = [
  ['reportTotalBonus', 'reports/total-bonus', totalBonus],
  ['reportEmployeesWithoutBonus', 'reports/employees-without-bonus', employeesWithoutBonus],
  ['reportBonusPercentage', 'reports/bonus-percentage', bonusPercentage],
  ['reportDepartmentsBonusOverAvgSalary', 'reports/departments-bonus-over-avg-salary', departmentsBonusOverAverageSalary],
  ['reportBonusRanking', 'reports/bonus-ranking', bonusRanking],
  ['reportTopEarner', 'reports/top-earner', topEarner],
];

for (const [name, route, handler] of routes) {
  app.http(name, { methods: ['GET'], route, authLevel: 'function', handler });
}
