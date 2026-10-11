/**
 * Part A handlers, end to end against the test database: request → validation → SQL → response.
 * The fixture is restored before every test because these tests change data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getDepartments } from '../../src/functions/departments';
import { createEmployee, deleteEmployee, getEmployee, listEmployees, updateEmployee } from '../../src/functions/employees';
import { httpRequest, invocationContext } from './http';
import { resetFixture } from './testDatabase';

const call = (handler: typeof getEmployee, ...args: Parameters<typeof httpRequest>) =>
  handler(httpRequest(...args), invocationContext());

const get = (id: string) => call(getEmployee, 'GET', `employees/${id}`, { params: { id } });
const patch = (id: string, body: unknown) => call(updateEmployee, 'PATCH', `employees/${id}`, { params: { id }, body });

beforeEach(resetFixture);

describe('GET /api/employees/{id}', () => {
  it('returns the employee with raw and effective compensation', async () => {
    expect(await get('1')).toEqual({
      status: 200,
      jsonBody: {
        employeeId: 1,
        firstName: 'Dan',
        lastName: 'Alpha-One',
        departmentId: 1,
        departmentName: 'Alpha',
        salary: 30000,
        bonus: 40000,
        hireDate: '2020-01-15',
        effectiveBonus: 40000,
        isDefaultBonus: false,
        totalCompensation: 70000,
        effectiveTotalCompensation: 70000,
      },
    });
  });

  it('applies the 5% default only in effectiveBonus when no bonus was awarded', async () => {
    expect((await get('2')).jsonBody).toMatchObject({
      bonus: null, // stored value unchanged
      effectiveBonus: 2500, // 5% of 50,000
      isDefaultBonus: true,
      totalCompensation: 50000,
      effectiveTotalCompensation: 52500,
    });
  });

  it('does not apply the default to a recorded bonus of 0', async () => {
    expect((await get('10')).jsonBody).toMatchObject({ bonus: 0, effectiveBonus: 0, isDefaultBonus: false });
  });

  it('returns null department and hire date when they are not set', async () => {
    expect((await get('8')).jsonBody).toMatchObject({ departmentId: null, departmentName: null });
    expect((await get('5')).jsonBody).toMatchObject({ hireDate: null });
  });

  it('returns 404 with the standard error body for an unknown id', async () => {
    expect(await get('999')).toEqual({
      status: 404,
      jsonBody: { error: 'NotFound', message: 'Employee 999 was not found.', correlationId: 'test-invocation-id' },
      headers: undefined,
    });
  });

  it.each(['abc', '0', '-1', '1.5'])('returns 400 for id "%s"', async (id) => {
    expect((await get(id)).status).toBe(400);
  });
});

describe('GET /api/employees', () => {
  it('lists every employee ordered by id', async () => {
    const response = await call(listEmployees, 'GET', 'employees');
    expect(response.status).toBe(200);
    const body = response.jsonBody as { items: { employeeId: number }[]; count: number };
    expect(body.count).toBe(10);
    expect(body.items.map((e) => e.employeeId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('filters by department', async () => {
    const body = (await call(listEmployees, 'GET', 'employees?departmentId=1')).jsonBody as { items: { employeeId: number }[] };
    expect(body.items.map((e) => e.employeeId)).toEqual([1, 2, 3]);
  });

  it('returns an empty list for a department with no employees or that does not exist', async () => {
    expect((await call(listEmployees, 'GET', 'employees?departmentId=4')).jsonBody).toEqual({ items: [], count: 0 });
    expect((await call(listEmployees, 'GET', 'employees?departmentId=99')).jsonBody).toEqual({ items: [], count: 0 });
  });

  it.each(['abc', '', '0'])('returns 400 for departmentId "%s"', async (value) => {
    expect((await call(listEmployees, 'GET', `employees?departmentId=${value}`)).status).toBe(400);
  });
});

describe('POST /api/employees', () => {
  it('creates an employee with only the required fields; bonus is optional', async () => {
    const response = await call(createEmployee, 'POST', 'employees', { body: { firstName: 'Nia', lastName: 'New', salary: 45000 } });

    expect(response.status).toBe(201);
    expect(response.headers).toEqual({ Location: '/api/employees/11' });
    expect(response.jsonBody).toMatchObject({
      employeeId: 11,
      departmentId: null,
      bonus: null,
      hireDate: null,
      effectiveBonus: 2250,
      isDefaultBonus: true,
    });
    expect((await get('11')).status).toBe(200);
  });

  it('stores every field exactly, including non-ASCII names, cents and the date', async () => {
    const body = { firstName: 'Łucja', lastName: 'Ørsted-Zoë', departmentId: 2, salary: 100.07, bonus: 0.05, hireDate: '2024-02-29' };
    const response = await call(createEmployee, 'POST', 'employees', { body });

    expect(response.status).toBe(201);
    expect((await get('11')).jsonBody).toMatchObject({ ...body, departmentName: 'Beta' });
  });

  it('stores the first and last dates SQL Server DATE allows, and returns 400 (not 500) for year 0000', async () => {
    const first = await call(createEmployee, 'POST', 'employees', {
      body: { firstName: 'Early', lastName: 'Date', salary: 1, hireDate: '0001-01-01' },
    });
    const last = await call(createEmployee, 'POST', 'employees', {
      body: { firstName: 'Late', lastName: 'Date', salary: 1, hireDate: '9999-12-31' },
    });
    expect(first.jsonBody).toMatchObject({ hireDate: '0001-01-01' });
    expect(last.jsonBody).toMatchObject({ hireDate: '9999-12-31' });

    const yearZero = { hireDate: '0000-01-01' };
    expect((await call(createEmployee, 'POST', 'employees', { body: { firstName: 'No', lastName: 'Date', salary: 1, ...yearZero } })).status).toBe(400);
    expect((await patch('1', yearZero)).status).toBe(400);
  });

  it('returns 422 for a department that does not exist, and creates nothing', async () => {
    const response = await call(createEmployee, 'POST', 'employees', {
      body: { firstName: 'Nia', lastName: 'New', salary: 45000, departmentId: 99 },
    });

    expect(response).toMatchObject({
      status: 422,
      jsonBody: { error: 'UnknownDepartment', details: [{ field: 'departmentId', issue: 'no department has this ID' }] },
    });
    expect(((await call(listEmployees, 'GET', 'employees')).jsonBody as { count: number }).count).toBe(10);
  });

  it('returns 400 listing every invalid field', async () => {
    const response = await call(createEmployee, 'POST', 'employees', { body: { firstName: '', salary: -1 } });
    expect(response.status).toBe(400);
    expect((response.jsonBody as { details: { field: string }[] }).details.map((d) => d.field)).toEqual(['firstName', 'lastName', 'salary']);
  });

  it('returns 400 for malformed JSON and for a missing body', async () => {
    expect((await call(createEmployee, 'POST', 'employees', { body: '{"firstName":' })).status).toBe(400);
    expect((await call(createEmployee, 'POST', 'employees')).status).toBe(400);
  });
});

describe('PATCH /api/employees/{id}', () => {
  it('changes only the fields sent', async () => {
    const response = await patch('3', { bonus: 12500.5 });
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ employeeId: 3, firstName: 'Finn', salary: 40000, bonus: 12500.5, departmentId: 1 });
  });

  it('clears a bonus with null, after which the 5% default applies', async () => {
    expect((await patch('1', { bonus: null })).jsonBody).toMatchObject({
      bonus: null,
      effectiveBonus: 1500, // 5% of 30,000
      isDefaultBonus: true,
    });
  });

  it('can move an employee to another department, or out of all departments', async () => {
    expect((await patch('8', { departmentId: 3 })).jsonBody).toMatchObject({ departmentId: 3, departmentName: 'Gamma' });
    expect((await patch('8', { departmentId: null })).jsonBody).toMatchObject({ departmentId: null, departmentName: null });
  });

  it('updates several fields at once, including the hire date', async () => {
    expect((await patch('5', { lastName: 'Renamed', salary: 41000, hireDate: '2020-10-01' })).jsonBody).toMatchObject({
      firstName: 'Hana',
      lastName: 'Renamed',
      salary: 41000,
      hireDate: '2020-10-01',
    });
  });

  it('returns 404 for an unknown employee', async () => {
    expect((await patch('999', { bonus: 1 })).status).toBe(404);
  });

  it('returns 422 for an unknown department and leaves the employee unchanged', async () => {
    expect((await patch('1', { departmentId: 99 })).status).toBe(422);
    expect((await get('1')).jsonBody).toMatchObject({ departmentId: 1 });
  });

  it('returns 400 for an empty update and for null on a required field', async () => {
    expect((await patch('1', {})).status).toBe(400);
    expect((await patch('1', { salary: null })).status).toBe(400);
  });
});

describe('DELETE /api/employees/{id}', () => {
  it('deletes the employee and returns 204 with no body', async () => {
    expect(await call(deleteEmployee, 'DELETE', 'employees/10', { params: { id: '10' } })).toEqual({ status: 204 });
    expect((await get('10')).status).toBe(404);
  });

  it('returns 404 when the employee does not exist (including a second delete)', async () => {
    await call(deleteEmployee, 'DELETE', 'employees/10', { params: { id: '10' } });
    expect((await call(deleteEmployee, 'DELETE', 'employees/10', { params: { id: '10' } })).status).toBe(404);
  });
});

describe('GET /api/departments', () => {
  it('lists all departments, including empty ones and ones without a location', async () => {
    expect((await call(getDepartments, 'GET', 'departments')).jsonBody).toEqual({
      items: [
        { departmentId: 1, departmentName: 'Alpha', location: 'Pune' },
        { departmentId: 2, departmentName: 'Beta', location: null },
        { departmentId: 3, departmentName: 'Gamma', location: 'Mumbai' },
        { departmentId: 4, departmentName: 'Delta', location: 'Delhi' },
      ],
      count: 4,
    });
  });
});
