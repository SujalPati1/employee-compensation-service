import { existsSync, readFileSync } from 'node:fs';

/**
 * Copies Values from a Functions local.settings.json file into process.env, without
 * overriding variables that are already set (so CI and Azure can supply their own).
 * Does nothing if the file does not exist.
 */
export function loadLocalSettings(file: string): void {
  if (!existsSync(file)) return;

  const { Values = {} } = JSON.parse(readFileSync(file, 'utf8')) as { Values?: Record<string, string> };
  for (const [key, value] of Object.entries(Values)) {
    process.env[key] ??= value;
  }
}
