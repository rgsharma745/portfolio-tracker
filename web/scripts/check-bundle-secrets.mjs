// Fails if the build output contains a Supabase secret: an sb_secret_ key or a
// service_role JWT. (supabase-js itself contains the bare "sb_secret_" prefix, so a
// plain grep gives false positives.)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

function isServiceRoleJwt(payload) {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).role === 'service_role';
  } catch {
    return false;
  }
}

const offenders = [];
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  if (SECRET_KEY.test(text) || [...text.matchAll(JWT)].some((m) => isServiceRoleJwt(m[1]))) {
    offenders.push(file);
  }
}

if (offenders.length) {
  console.error(`Secret key found in build output:\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log(`No Supabase secrets in ${root}/`);
