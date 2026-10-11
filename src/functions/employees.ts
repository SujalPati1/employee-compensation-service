/**
 * Part A: employee CRUD.
 *
 *   POST   /api/employees                    create            201 + Location
 *   GET    /api/employees?departmentId=3     list (optional)   200 { items, count }
 *   GET    /api/employees/{id}               get one           200 | 404
 *   PATCH  /api/employees/{id}               merge patch       200 | 404
 *   DELETE /api/employees/{id}               delete            204 | 404
 *
 * Each handler: parse the request, validate, call the repository, shape the response.
 * Errors are turned into HTTP responses by withErrorHandling.
 */
import { app } from '@azure/functions';
import { NotFoundError } from '../http/errors';
import { parseId, readJsonBody } from '../http/requestParsing';
import { created, noContent, ok } from '../http/responses';
import { withErrorHandling } from '../http/withErrorHandling';
import { createLogger } from '../logging/logger';
import * as employees from '../repositories/employeeRepository';
import { createEmployeeSchema, updateEmployeeSchema } from '../validation/employeeSchemas';
import { parseWith } from '../validation/parse';

const notFound = (employeeId: number) => new NotFoundError(`Employee ${employeeId} was not found.`);

export const createEmployee = withErrorHandling(async (request, context) => {
  const log = createLogger(context);
  const input = parseWith(createEmployeeSchema, await readJsonBody(request));

  const employee = await employees.createEmployee(input, log);
  log.info('employee.created', { employeeId: employee.employeeId });
  return created(employee, `/api/employees/${employee.employeeId}`);
});

export const listEmployees = withErrorHandling(async (request, context) => {
  const departmentParam = request.query.get('departmentId');
  const departmentId = departmentParam === null ? undefined : parseId(departmentParam, 'departmentId');

  const items = await employees.listEmployees({ departmentId }, createLogger(context));
  return ok({ items, count: items.length });
});

export const getEmployee = withErrorHandling(async (request, context) => {
  const employeeId = parseId(request.params.id);
  const employee = await employees.getEmployeeById(employeeId, createLogger(context));
  if (!employee) throw notFound(employeeId);
  return ok(employee);
});

export const updateEmployee = withErrorHandling(async (request, context) => {
  const log = createLogger(context);
  const employeeId = parseId(request.params.id);
  const changes = parseWith(updateEmployeeSchema, await readJsonBody(request));

  const employee = await employees.updateEmployee(employeeId, changes, log);
  if (!employee) throw notFound(employeeId);
  log.info('employee.updated', { employeeId });
  return ok(employee);
});

export const deleteEmployee = withErrorHandling(async (request, context) => {
  const log = createLogger(context);
  const employeeId = parseId(request.params.id);

  if (!(await employees.deleteEmployee(employeeId, log))) throw notFound(employeeId);
  log.info('employee.deleted', { employeeId });
  return noContent();
});

app.http('createEmployee', { methods: ['POST'], route: 'employees', authLevel: 'function', handler: createEmployee });
app.http('listEmployees', { methods: ['GET'], route: 'employees', authLevel: 'function', handler: listEmployees });
app.http('getEmployee', { methods: ['GET'], route: 'employees/{id}', authLevel: 'function', handler: getEmployee });
app.http('updateEmployee', { methods: ['PATCH'], route: 'employees/{id}', authLevel: 'function', handler: updateEmployee });
app.http('deleteEmployee', { methods: ['DELETE'], route: 'employees/{id}', authLevel: 'function', handler: deleteEmployee });
