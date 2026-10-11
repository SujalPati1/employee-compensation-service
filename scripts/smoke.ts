/**
 * Calls every endpoint once and checks the HTTP status of each. Use it before a demo.
 *
 *   npm run smoke                                   local API (http://localhost:7071/api)
 *   npm run smoke -- https://<app>.azurewebsites.net/api
 *
 * For Azure, the function key is read from AZURE_FUNCTION_KEY (environment or .env). The test
 * creates one employee and deletes it again; it does not check report values, so it works with
 * any data.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Compiled to dist/scripts/smoke.js, so the repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');

function readFunctionKey(): string | undefined {
  if (process.env.AZURE_FUNCTION_KEY) return process.env.AZURE_FUNCTION_KEY;
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return undefined;
  return /^AZURE_FUNCTION_KEY=(.+)$/m.exec(readFileSync(envFile, 'utf8'))?.[1]?.trim();
}

interface Check {
  label: string;
  method: string;
  path: string | (() => string);
  body?: unknown;
  expect: number;
  noKey?: boolean;
}

async function main(): Promise<void> {
  const baseUrl = (process.argv[2] ?? 'http://localhost:7071/api').replace(/\/$/, '');
  const key = readFunctionKey();
  const isLocal = baseUrl.includes('localhost');
  if (!isLocal && !key) throw new Error('Set AZURE_FUNCTION_KEY (environment or .env) to test the Azure app.');

  let createdId = 0;
  const checks: Check[] = [
    { label: 'health', method: 'GET', path: '/health', expect: 200, noKey: true },
    ...(isLocal ? [] : [{ label: 'data endpoint without key is refused', method: 'GET', path: '/employees/1', expect: 401, noKey: true }]),
    { label: 'list departments', method: 'GET', path: '/departments', expect: 200 },
    { label: 'list employees', method: 'GET', path: '/employees', expect: 200 },
    { label: 'filter employees by department', method: 'GET', path: '/employees?departmentId=1', expect: 200 },
    { label: 'create employee', method: 'POST', path: '/employees', body: { firstName: 'Smoke', lastName: 'Test', salary: 1000 }, expect: 201 },
    { label: 'get created employee', method: 'GET', path: () => `/employees/${createdId}`, expect: 200 },
    { label: 'patch bonus', method: 'PATCH', path: () => `/employees/${createdId}`, body: { bonus: 50 }, expect: 200 },
    { label: 'delete employee', method: 'DELETE', path: () => `/employees/${createdId}`, expect: 204 },
    { label: 'deleted employee is gone', method: 'GET', path: () => `/employees/${createdId}`, expect: 404 },
    { label: 'invalid body is rejected', method: 'POST', path: '/employees', body: { firstName: '' }, expect: 400 },
    { label: 'unknown department is rejected', method: 'POST', path: '/employees', body: { firstName: 'A', lastName: 'B', salary: 1, departmentId: 999999 }, expect: 422 },
    ...['total-bonus', 'employees-without-bonus', 'bonus-percentage', 'departments-bonus-over-avg-salary', 'bonus-ranking', 'top-earner'].map(
      (report): Check => ({ label: `report: ${report}`, method: 'GET', path: `/reports/${report}`, expect: 200 }),
    ),
  ];

  console.log(`Smoke test against ${baseUrl}\n`);
  let failures = 0;
  for (const check of checks) {
    const path = typeof check.path === 'function' ? check.path() : check.path;
    const started = Date.now();
    const response = await fetch(baseUrl + path, {
      method: check.method,
      headers: { 'content-type': 'application/json', ...(key && !check.noKey ? { 'x-functions-key': key } : {}) },
      body: check.body === undefined ? undefined : JSON.stringify(check.body),
    });
    const text = await response.text();
    if (check.label === 'create employee' && response.status === 201) {
      createdId = (JSON.parse(text) as { employeeId: number }).employeeId;
    }

    const passed = response.status === check.expect;
    if (!passed) failures++;
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(response.status).padEnd(4)} ${String(Date.now() - started).padStart(6)} ms  ${check.method.padEnd(6)} ${path}  (${check.label})`);
  }

  console.log(`\n${checks.length - failures} of ${checks.length} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`Smoke test failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
