import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

/** E2E runs only against the local Supabase stack (`npx supabase start` at the repo root). */
export interface LocalSupabase {
  apiUrl: string;
  anonKey: string;
  serviceKey: string;
  mailpitUrl: string;
}

const npx = join(dirname(process.execPath), process.platform === 'win32' ? 'npx.cmd' : 'npx');
let cached: LocalSupabase | undefined;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let out: string;
  try {
    out = execFileSync(npx, ['-y', 'supabase@3.2.0', 'status', '-o', 'json'], {
      cwd: resolve(__dirname, '../../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('Local Supabase is not running. Start it with `npx supabase start`.');
  }
  const status = JSON.parse(out.slice(out.indexOf('{')));
  cached = {
    apiUrl: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceKey: status.SERVICE_ROLE_KEY,
    mailpitUrl: status.MAILPIT_URL,
  };
  return cached;
}
