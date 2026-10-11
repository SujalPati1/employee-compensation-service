import { withDatabase } from '../db/pool';
import type { Logger } from '../logging/logger';

export interface Department {
  departmentId: number;
  departmentName: string;
  location: string | null;
}

/** Departments are seeded, not managed through the API (assumption A8), so this is read-only. */
export async function listDepartments(log?: Logger): Promise<Department[]> {
  const result = await withDatabase(
    (pool) =>
      pool.request().query<Department>(
        `SELECT DepartmentID AS departmentId, DepartmentName AS departmentName, Location AS location
         FROM dbo.Department
         ORDER BY DepartmentID`,
      ),
    { idempotent: true, log },
  );
  return result.recordset;
}
