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
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { readDatabaseSettings } from '../src/db/config';
import { applySqlFiles, countRows, ensureDatabaseExists } from './lib/applySql';
import { loadLocalSettings } from './lib/localSettings';

// Compiled to dist/scripts/db-setup.js, so the repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');

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
      options.files = value.split(',').map((file) => join(ROOT, file.trim()));
      i++;
    } else {
      throw new Error(`Unknown or incomplete option "${args[i]}".`);
    }
  }
  return options;
}

function defaultScripts(): string[] {
  const sqlDir = join(ROOT, 'sql');
  return readdirSync(sqlDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => join(sqlDir, file));
}

async function main(): Promise<void> {
  loadLocalSettings(join(ROOT, 'local.settings.json'));
  const options = parseOptions(process.argv.slice(2));
  const settings = readDatabaseSettings();
  const database = options.database ?? settings.database;
  const files = options.files ?? defaultScripts();

  console.log(`Target: ${settings.server}:${settings.port}, database ${database} (${settings.auth} auth).`);

  if (settings.auth === 'sql' && (await ensureDatabaseExists(settings, database))) {
    console.log(`Created database ${database}.`);
  }

  await applySqlFiles(settings, database, files, (file, batchCount) =>
    console.log(`Ran ${relative(ROOT, file)} (${batchCount} batch${batchCount === 1 ? '' : 'es'}).`),
  );

  const counts = await countRows(settings, database);
  console.log(`Database now has ${counts.departments} departments and ${counts.employees} employees.`);
}

main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(`Database setup failed: ${(error as Error).message}`);
  if (code === 'ESOCKET' || code === 'ETIMEOUT') {
    console.error('Is the database running? Start it with `npm run db:up`.');
  }
  process.exitCode = 1;
});
