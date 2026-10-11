/**
 * Points the tests at a separate test database and resets its data.
 *
 * Settings come from environment variables (CI) or local.settings.json (your machine), but the
 * database name is always replaced with the test database, so tests never touch demo data.
 */
import { join, resolve } from 'node:path';
import { readDatabaseSettings, type DatabaseSettings } from '../../src/db/config';
import { applySqlFiles, ensureDatabaseExists } from '../../scripts/lib/applySql';
import { loadLocalSettings } from '../../scripts/lib/localSettings';

const ROOT = resolve(__dirname, '..', '..');

export const SCHEMA_FILES = [join(ROOT, 'sql', '001_schema.sql'), join(ROOT, 'sql', '002_views.sql')];
export const FIXTURE_FILE = join(ROOT, 'tests', 'fixtures', 'fixture.sql');

/** Loads settings and switches SQL_DATABASE to the test database. Refuses non-test databases. */
export function useTestDatabase(): DatabaseSettings {
  loadLocalSettings(join(ROOT, 'local.settings.json'));
  const database = process.env.TEST_SQL_DATABASE ?? 'CompensationTest';
  if (!/test/i.test(database)) {
    throw new Error(`Refusing to run tests against "${database}": the test database name must contain "Test".`);
  }
  process.env.SQL_DATABASE = database;
  return readDatabaseSettings();
}

/** Creates the test database if needed and brings its schema up to date. */
export async function prepareTestDatabase(): Promise<void> {
  const settings = useTestDatabase();
  if (settings.auth === 'sql') await ensureDatabaseExists(settings, settings.database);
  await applySqlFiles(settings, settings.database, SCHEMA_FILES);
}

/** Restores the fixture data. Call before tests that read it and after tests that change it. */
export async function resetFixture(): Promise<void> {
  const settings = useTestDatabase();
  await applySqlFiles(settings, settings.database, [FIXTURE_FILE]);
}
