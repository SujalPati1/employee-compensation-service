/**
 * Database connection settings, read from environment variables.
 *
 * SQL_AUTH selects how the app proves who it is to the database:
 *   sql    SQL login using SQL_USER and SQL_PASSWORD (the local Docker database)
 *   entra  Microsoft Entra token from DefaultAzureCredential: the Function App's managed
 *          identity in Azure, or your `az login` on a laptop. No password exists.
 */
import { DefaultAzureCredential } from '@azure/identity';
import type { config as MssqlConfig } from 'mssql';

export type SqlAuthMode = 'sql' | 'entra';

export interface DatabaseSettings {
  server: string;
  port: number;
  database: string;
  auth: SqlAuthMode;
  user?: string;
  password?: string;
  trustServerCertificate: boolean;
}

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

type Env = Record<string, string | undefined>;

export function readDatabaseSettings(env: Env = process.env): DatabaseSettings {
  const missing: string[] = [];
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) missing.push(key);
    return value ?? '';
  };

  const auth = (env.SQL_AUTH ?? 'sql').trim().toLowerCase();
  if (auth !== 'sql' && auth !== 'entra') {
    throw new ConfigurationError(`SQL_AUTH must be "sql" or "entra", but it is "${auth}".`);
  }

  const server = required('SQL_SERVER');
  const database = required('SQL_DATABASE');
  const user = auth === 'sql' ? required('SQL_USER') : undefined;
  const password = auth === 'sql' ? required('SQL_PASSWORD') : undefined;

  if (missing.length > 0) {
    throw new ConfigurationError(`Missing database settings: ${missing.join(', ')}.`);
  }
  if (password?.startsWith('<')) {
    throw new ConfigurationError('SQL_PASSWORD still has its placeholder value. Run `npm run setup` first.');
  }

  const port = Number(env.SQL_PORT ?? 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError(`SQL_PORT must be a port number, but it is "${env.SQL_PORT}".`);
  }

  return {
    server,
    port,
    database,
    auth,
    user,
    password,
    trustServerCertificate: env.SQL_TRUST_SERVER_CERTIFICATE?.trim().toLowerCase() === 'true',
  };
}

// Created once and reused, so Entra tokens are cached between connections.
let credential: DefaultAzureCredential | undefined;

/** Builds the mssql driver configuration. `database` overrides the configured database name. */
export function toMssqlConfig(settings: DatabaseSettings, database: string = settings.database): MssqlConfig {
  const base = {
    server: settings.server,
    port: settings.port,
    database,
    options: {
      encrypt: true,
      // Only true for the local container, which uses a self-signed certificate.
      trustServerCertificate: settings.trustServerCertificate,
    },
  };

  if (settings.auth === 'sql') {
    return { ...base, user: settings.user, password: settings.password };
  }

  credential ??= new DefaultAzureCredential();
  return { ...base, authentication: { type: 'token-credential', options: { credential } } };
}
