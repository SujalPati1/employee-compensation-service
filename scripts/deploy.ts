/**
 * Publishes the app to an Azure Function App.
 *
 *   npm run deploy -- <function-app-name>
 *
 * The package is assembled in a clean staging folder (.deploy/) containing only what the app
 * needs at run time: host.json, package.json, the compiled JavaScript and production
 * dependencies. Local secrets (.env, local.settings.json), sources and tests are never copied,
 * so they cannot end up in Azure. (.funcignore is not used: Core Tools 4.x skipped some of its
 * patterns, including .env, in testing.)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Compiled to dist/scripts/deploy.js, so the repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');
const STAGING = join(ROOT, '.deploy');

function run(command: string, args: string[], cwd: string): void {
  // npm and func are .cmd shims on Windows, which need a shell to start.
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

function main(): void {
  const appName = process.argv[2];
  if (!appName || !/^[a-zA-Z0-9-]+$/.test(appName)) {
    throw new Error('Usage: npm run deploy -- <function-app-name>');
  }

  console.log('Assembling the deployment package in .deploy/ ...');
  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING);

  for (const file of ['host.json', 'package.json', 'package-lock.json']) {
    cpSync(join(ROOT, file), join(STAGING, file));
  }
  cpSync(join(ROOT, 'dist', 'src'), join(STAGING, 'dist', 'src'), {
    recursive: true,
    filter: (source) => !source.endsWith('.map'),
  });
  // Only tells Core Tools which language this is; holds no settings or secrets and is not uploaded.
  writeFileSync(join(STAGING, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'node' } }));
  writeFileSync(join(STAGING, '.funcignore'), 'local.settings.json\n');

  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], STAGING);

  console.log(`Publishing to ${appName} ...`);
  // --no-build: the package is already complete, so Azure runs it as-is.
  run('func', ['azure', 'functionapp', 'publish', appName, '--no-build'], STAGING);
}

try {
  main();
} catch (error) {
  console.error(`Deploy failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
