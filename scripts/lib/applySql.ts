/**
 * Runs SQL script files against a database. Shared by `npm run db:setup` and the integration tests.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import sql from 'mssql';
import { toMssqlConfig, type DatabaseSettings } from '../../src/db/config';
import { splitSqlBatches } from './sqlBatches';

/** Creates a local database if it does not exist. In Azure the database comes from the Bicep template. */
export async function ensureDatabaseExists(settings: DatabaseSettings, database: string): Promise<boolean> {
  // CREATE DATABASE cannot take a parameter, so the name is restricted to safe characters.
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Database name "${database}" may only contain letters, digits and underscores.`);
  }

  const master = await new sql.ConnectionPool(toMssqlConfig(settings, 'master')).connect();
  try {
    const result = await master
      .request()
      .input('name', sql.NVarChar, database)
      .query<{ exists: number }>('SELECT CASE WHEN DB_ID(@name) IS NULL THEN 0 ELSE 1 END AS [exists]');
    if (result.recordset[0]?.exists === 1) return false;

    await master.request().batch(`CREATE DATABASE [${database}]`);
    return true;
  } finally {
    await master.close();
  }
}

/** Runs each file's batches in order on one connection pool. `onFile` reports progress. */
export async function applySqlFiles(
  settings: DatabaseSettings,
  database: string,
  files: string[],
  onFile?: (file: string, batchCount: number) => void,
): Promise<void> {
  const pool = await new sql.ConnectionPool(toMssqlConfig(settings, database)).connect();
  try {
    for (const file of files) {
      const batches = splitSqlBatches(readFileSync(file, 'utf8'));
      for (const [index, batch] of batches.entries()) {
        try {
          await pool.request().batch(batch);
        } catch (error) {
          const number = (error as { number?: number }).number;
          throw new Error(
            `${basename(file)}, batch ${index + 1}: ${(error as Error).message}${number ? ` (SQL error ${number})` : ''}`,
            { cause: error },
          );
        }
      }
      onFile?.(file, batches.length);
    }
  } finally {
    await pool.close();
  }
}

export async function countRows(settings: DatabaseSettings, database: string): Promise<{ departments: number; employees: number }> {
  const pool = await new sql.ConnectionPool(toMssqlConfig(settings, database)).connect();
  try {
    const result = await pool.request().query<{ departments: number; employees: number }>(
      'SELECT (SELECT COUNT(*) FROM dbo.Department) AS departments, (SELECT COUNT(*) FROM dbo.Employee) AS employees',
    );
    return result.recordset[0] ?? { departments: 0, employees: 0 };
  } finally {
    await pool.close();
  }
}
