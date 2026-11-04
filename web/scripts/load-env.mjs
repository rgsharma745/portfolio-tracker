// NG_APP_* settings for the build scripts. Sources, in priority order:
// process env, web/.env, repo-root .env.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    const name = line.slice(0, eq).trim();
    if (eq < 1 || !/^[A-Z0-9_]+$/.test(name)) continue;
    vars[name] = line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return vars;
}

export function loadEnv() {
  return {
    ...readDotEnv(resolve(webDir, '../.env')),
    ...readDotEnv(resolve(webDir, '.env')),
    ...process.env,
  };
}
