// Starts or stops the local Supabase stack (Docker) used by `npm run start:local` and e2e.
// Usage: npm run db:start   start the stack and ensure the local test user exists
//        npm run db:stop    stop the stack (data is kept for the next start)
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_USER = 'test@portfolio-tracker.com';
// Services the app does not use; skipping them makes startup faster and lighter.
const EXCLUDED = 'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, cwd = resolve(webDir, '..')) => execSync(command, { cwd, stdio: 'inherit' });

const action = process.argv[2];
if (action === 'start') {
  run(`npx -y supabase@3.0.0 start -x ${EXCLUDED}`);
  run(`node scripts/local-user.mjs ${TEST_USER} --seed`, webDir);
} else if (action === 'stop') {
  run('npx -y supabase@3.0.0 stop');
} else {
  console.error('Usage: node scripts/local-stack.mjs start|stop');
  process.exit(1);
}
