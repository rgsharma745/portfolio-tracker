// Starts or stops the local Supabase stack (Docker) used by `npm run start:local` and e2e.
// Usage: npm run db:start   start the stack and ensure the local test user exists
//        npm run db:reset   wipe local data, re-apply migrations, recreate the test user
//        npm run db:stop    stop the stack (data is kept for the next start)
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './supabase-cli.mjs';

const TEST_USER = 'test@portfolio-tracker.com';
// Services the app does not use; skipping them makes startup faster and lighter.
const EXCLUDED = 'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = (...args) => supabase(args, { stdio: 'inherit' });
// The same Node that runs this script, by absolute path.
const ensureTestUser = () =>
  execFileSync(process.execPath, ['scripts/local-user.mjs', TEST_USER, '--seed'], {
    cwd: webDir,
    stdio: 'inherit',
  });

const action = process.argv[2];
if (action === 'start') {
  cli('start', '-x', EXCLUDED);
  ensureTestUser();
} else if (action === 'reset') {
  // Wipes LOCAL data and re-applies supabase/migrations. Never pass --remote here:
  // that would target the production project.
  cli('db', 'reset');
  ensureTestUser();
} else if (action === 'stop') {
  cli('stop');
} else {
  console.error('Usage: node scripts/local-stack.mjs start|reset|stop');
  process.exit(1);
}
