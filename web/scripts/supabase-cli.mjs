// The pinned Supabase CLI for the local-stack scripts (local-stack, local-user, set-env --local).
// Runs it through the npx installed next to the Node running this script, by absolute path,
// not whichever `npx` comes first on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_CLI = 'supabase@3.0.0';
const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npx = join(dirname(process.execPath), process.platform === 'win32' ? 'npx.cmd' : 'npx');

/** Runs `supabase <args>` from the repo root. `options` go to execFileSync (no shell). */
export function supabase(args, options = {}) {
  if (!existsSync(npx)) throw new Error(`npx not found next to node (${npx})`);
  return execFileSync(npx, ['-y', SUPABASE_CLI, ...args], { cwd: repoDir, ...options });
}

/** Only the local stack: these scripts hold its service key and must never reach another host. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * `supabase status` of the running local stack, or null when it is not running. Its API URL
 * is checked to be on this machine, and returned as a URL to build requests from.
 */
export function localStatus() {
  let status;
  try {
    const out = supabase(['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    status = JSON.parse(out.slice(out.indexOf('{')));
  } catch {
    return null;
  }
  const api = new URL(status.API_URL);
  if (api.protocol !== 'http:' || !LOCAL_HOSTS.has(api.hostname)) {
    throw new Error(`supabase status gave a non-local API URL (${api.origin})`);
  }
  return {
    api,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    mailpitUrl: status.MAILPIT_URL,
  };
}
