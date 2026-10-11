/**
 * GET /api/departments: read-only list, so clients can find valid department IDs.
 */
import { app } from '@azure/functions';
import { ok } from '../http/responses';
import { withErrorHandling } from '../http/withErrorHandling';
import { createLogger } from '../logging/logger';
import { listDepartments } from '../repositories/departmentRepository';

export const getDepartments = withErrorHandling(async (_request, context) => {
  const items = await listDepartments(createLogger(context));
  return ok({ items, count: items.length });
});

app.http('listDepartments', { methods: ['GET'], route: 'departments', authLevel: 'function', handler: getDepartments });
