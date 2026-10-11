import { prepareTestDatabase } from './testDatabase';

/** Runs once before the integration tests: creates the test database and applies the schema. */
export default async function setup(): Promise<void> {
  try {
    await prepareTestDatabase();
  } catch (error) {
    const code = (error as { code?: string }).code;
    const hint = code === 'ESOCKET' || code === 'ETIMEOUT' ? ' Is the database running? Start it with `npm run db:up`.' : '';
    throw new Error(`Could not prepare the test database: ${(error as Error).message}.${hint}`, { cause: error });
  }
}
