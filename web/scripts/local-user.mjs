// Creates a user in the LOCAL Supabase stack so you can sign in to `npm run start:local`.
// Usage: npm run local:user -- you@example.com [--seed]
//   --seed  also creates two sample portfolios ("Me", "Wife") with sample holdings, cards and
//           bills (only if the user has no funds yet), plus sample latest prices.
// Sign-up is disabled, so users can only be created through the admin API. This script only
// ever talks to the local stack (keys come from `supabase status`), never to production.
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedHistory, seedHoldings } from './local-seed.mjs';

const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const seed = process.argv.includes('--seed');
if (!email) {
  console.error('Usage: npm run local:user -- you@example.com [--seed]');
  process.exit(1);
}

let status;
try {
  const out = execSync('npx -y supabase@3.0.0 status -o json', {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  status = JSON.parse(out.slice(out.indexOf('{')));
} catch {
  console.error('Local Supabase is not running. Start it with `npx supabase start`.');
  process.exit(1);
}

const headers = {
  apikey: status.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const api = (path, init = {}) =>
  fetch(`${status.API_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } });

async function findOrCreateUser() {
  const created = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (created.ok) return { id: (await created.json()).id, isNew: true };
  const list = await (await api('/auth/v1/admin/users?per_page=1000')).json();
  const user = list.users?.find((u) => u.email === email);
  if (!user) throw new Error(`Could not create ${email}: ${await created.text()}`);
  return { id: user.id, isNew: false };
}

const user = await findOrCreateUser();
console.log(`${user.isNew ? 'Created' : 'Found existing'} local user ${email}`);

if (seed) {
  const res = await api('/rest/v1/portfolios?on_conflict=owner_id,name', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(
      ['Me', 'Wife'].map((name, i) => ({ owner_id: user.id, name, sort_order: i + 1 })),
    ),
  });
  if (!res.ok) throw new Error(`Could not seed portfolios: ${await res.text()}`);
  console.log('Seeded portfolios: Me, Wife');
  if (await seedHoldings(api, user.id)) console.log('Seeded sample holdings, cards and bills');
  if (await seedHistory(api, user.id)) console.log('Seeded 200 days of sample history');
}

console.log(`
Next:
  1. npm run start:local          (app on http://localhost:4300, local database)
  2. Sign in with ${email}
  3. Open the email in Mailpit:   ${status.MAILPIT_URL}`);
