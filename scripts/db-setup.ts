/**
 * Creates the database if needed, then runs SQL scripts against it in order.
 *
 *   npm run db:setup                              sql/*.sql on the configured database
 *   npm run db:setup -- --database <name>         the same scripts on another database
 *   npm run db:setup -- --files <a.sql,b.sql>     only these files (paths from the repo root)
 *
 * Connection settings come from environment variables, falling back to the values in
 * local.settings.json, so local setup needs nothing extra. Environment variables take
 * priority, which lets CI and the Azure deployment supply their own settings.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sql from 'mssql';
import { readDatabaseSettings, toMssqlConfig, type DatabaseSettings } from '../src/db/config';
import { splitSqlBatches } from './sqlBatches';

// Compiled to dist/scripts/db-setup.js, so the repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');
const SQL_DIR = join(ROOT, 'sql');

interface Options {
  database?: string;
  files?: string[];
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let i = 0; i < args.length; i++) {
    const value = args[i + 1];
    if (args[i] === '--database' && value) {
      options.database = value;
      i++;
    } else if (args[i] === '--files' && value) {
      options.files = value.split(',').map((file) => file.trim());
      i++;
    } else {
      throw new Error(`Unknown or incomplete option "${args[i]}".`);
    }
  }
  return options;
}

/** Copies Values from local.settings.json into process.env, without overriding variables already set. */
function loadLocalSettings(): void {
  const file = join(ROOT, 'local.settings.json');
  if (!existsSync(file)) return;

  const { Values = {} } = JSON.parse(readFileSync(file, 'utf8')) as { Values?: Record<string, string> };
  for (const [key, value] of Object.entries(Values)) {
    process.env[key] ??= value;
  }
}

function defaultScripts(): string[] {
  return readdirSync(SQL_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => join('sql', file));
}

/** Local databases are created here. In Azure the database is created by the Bicep template. */
async function ensureDatabaseExists(settings: DatabaseSettings, database: string): Promise<void> {
  // CREATE DATABASE cannot take a parameter, so the name is restricted to safe characters.
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Database name "${database}" may only contain letters, digits and underscores.`);
  }

  const master = await new sql.ConnectionPool(toMssqlConfig(settings, 'master')).connect();
  try {
    const result = await master.request().input('name', sql.NVarChar, database).query<{ exists: number }>(
      'SELECT CASE WHEN DB_ID(@name) IS NULL THEN 0 ELSE 1 END AS [exists]',
    );
    if (result.recordset[0]?.exists === 0) {
      await master.request().batch(`CREATE DATABASE [${database}]`);
      console.log(`Created database ${database}.`);
    }
  } finally {
    await master.close();
  }
}

async function runScript(pool: sql.ConnectionPool, file: string): Promise<void> {
  const batches = splitSqlBatches(readFileSync(join(ROOT, file), 'utf8'));
  for (const [index, batch] of batches.entries()) {
    try {
      await pool.request().batch(batch);
    } catch (error) {
      const number = (error as { number?: number }).number;
      throw new Error(
        `${file}, batch ${index + 1}: ${(error as Error).message}${number ? ` (SQL error ${number})` : ''}`,
        { cause: error },
      );
    }
  }
  console.log(`Ran ${file} (${batches.length} batch${batches.length === 1 ? '' : 'es'}).`);
}

async function printRowCounts(pool: sql.ConnectionPool): Promise<void> {
  const result = await pool.request().query<{ departments: number; employees: number }>(
    'SELECT (SELECT COUNT(*) FROM dbo.Department) AS departments, (SELECT COUNT(*) FROM dbo.Employee) AS employees',
  );
  const counts = result.recordset[0];
  if (counts) console.log(`Database now has ${counts.departments} departments and ${counts.employees} employees.`);
}

async function main(): Promise<void> {
  loadLocalSettings();
  const options = parseOptions(process.argv.slice(2));
  const settings = readDatabaseSettings();
  const database = options.database ?? settings.database;
  const files = options.files ?? defaultScripts();

  console.log(`Target: ${settings.server}:${settings.port}, database ${database} (${settings.auth} auth).`);

  if (settings.auth === 'sql') await ensureDatabaseExists(settings, database);

  const pool = await new sql.ConnectionPool(toMssqlConfig(settings, database)).connect();
  try {
    for (const file of files) await runScript(pool, file);
    await printRowCounts(pool);
  } finally {
    await pool.close();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(`Database setup failed: ${(error as Error).message}`);
  if (code === 'ESOCKET' || code === 'ETIMEOUT') {
    console.error('Is the database running? Start it with `npm run db:up`.');
  }
  process.exitCode = 1;
});
