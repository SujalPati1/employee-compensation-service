/**
 * Creates the database if needed, then runs SQL scripts against it in order.
 *
 * Local (Docker, settings from local.settings.json):
 *   npm run db:setup                              sql/*.sql on the configured database
 *   npm run db:setup -- --database <name>         the same scripts on another database
 *   npm run db:setup -- --files <a.sql,b.sql>     only these files (paths from the repo root)
 *
 * Azure SQL (signs in as you through `az login`; no password exists):
 *   npm run db:setup -- --azure <sql-server-name>
 *   npm run db:setup -- --azure <sql-server-name> --grant-app <function-app-name>
 *     --grant-app also gives the Function App's managed identity read/write access to data.
 *
 * Environment variables take priority over local.settings.json, which lets CI supply its own.
 */
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { readDatabaseSettings } from '../src/db/config';
import { applySqlFiles, countRows, ensureDatabaseExists, grantAppAccess } from './lib/applySql';
import { loadLocalSettings } from './lib/localSettings';

// Compiled to dist/scripts/db-setup.js, so the repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');

interface Options {
  database?: string;
  files?: string[];
  azureServer?: string;
  grantApp?: string;
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Option "${flag}" needs a value.`);

    if (flag === '--database') options.database = value;
    else if (flag === '--files') options.files = value.split(',').map((file) => join(ROOT, file.trim()));
    else if (flag === '--azure') options.azureServer = value;
    else if (flag === '--grant-app') options.grantApp = value;
    else throw new Error(`Unknown option "${flag}".`);
    i++;
  }
  if (options.grantApp && !options.azureServer) throw new Error('--grant-app only applies with --azure.');
  return options;
}

/** Points the connection settings at Azure SQL with Entra sign-in, ignoring local Docker settings. */
function useAzure(server: string): void {
  process.env.SQL_AUTH = 'entra';
  process.env.SQL_SERVER = server.includes('.') ? server : `${server}.database.windows.net`;
  process.env.SQL_PORT = '1433';
  process.env.SQL_DATABASE ??= 'Compensation';
  process.env.SQL_TRUST_SERVER_CERTIFICATE = 'false';
}

function defaultScripts(): string[] {
  const sqlDir = join(ROOT, 'sql');
  return readdirSync(sqlDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => join(sqlDir, file));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.azureServer) useAzure(options.azureServer);
  else loadLocalSettings(join(ROOT, 'local.settings.json'));

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

  if (options.grantApp) {
    await grantAppAccess(settings, database, options.grantApp);
    console.log(`Granted ${options.grantApp} read/write access to data (db_datareader, db_datawriter).`);
  }

  const counts = await countRows(settings, database);
  console.log(`Database now has ${counts.departments} departments and ${counts.employees} employees.`);
}

main().catch((error: unknown) => {
  const { code, message } = error as { code?: string; message?: string };
  console.error(`Database setup failed: ${message}`);
  if (code === 'ESOCKET' || code === 'ETIMEOUT') {
    console.error('Is the database running? Start it with `npm run db:up`.');
  }
  const blockedIp = /Client with IP address '([\d.]+)' is not allowed/.exec(message ?? '')?.[1];
  if (blockedIp) {
    console.error(`Allow your IP on the server first: az sql server firewall-rule create -g <group> -s <server> -n my-ip --start-ip-address ${blockedIp} --end-ip-address ${blockedIp}`);
  }
  process.exitCode = 1;
});
