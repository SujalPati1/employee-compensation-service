import { afterAll } from 'vitest';
import { closePool } from '../../src/db/pool';
import { useTestDatabase } from './testDatabase';

// Runs in every integration test worker before its tests: the app's own pool connects to the test database.
useTestDatabase();

afterAll(async () => {
  await closePool();
});
