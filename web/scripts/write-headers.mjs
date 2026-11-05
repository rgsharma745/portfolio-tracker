// Writes Cloudflare's _headers into the build output (docs/SECURITY.md, "Web hardening").
// The CSP allows the app's own files plus the Supabase project from NG_APP_SUPABASE_URL,
// so the policy never needs editing by hand. Runs after `ng build`.
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, webDir } from './load-env.mjs';

const outDir = resolve(webDir, 'dist/portfolio-tracker/browser');
if (!existsSync(outDir)) {
  console.error('write-headers: build output not found; run `ng build` first.');
  process.exit(1);
}

const env = loadEnv();
let connect = "'self'";
if (env.NG_APP_SUPABASE_URL) {
  const url = new URL(env.NG_APP_SUPABASE_URL);
  connect += ` ${url.origin} wss://${url.host}`;
} else if (env.WORKERS_CI || env.CF_PAGES) {
  console.error('write-headers: NG_APP_SUPABASE_URL must be set.');
  process.exit(1);
}

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  // PrimeNG writes its theme into <style> tags at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${connect}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const headers = `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: ${csp}

# The service worker and its manifest must be re-checked on every visit, or updates stall.
/ngsw-worker.js
  Cache-Control: no-cache
/ngsw.json
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
`;

writeFileSync(resolve(outDir, '_headers'), headers);
console.log('write-headers: wrote _headers');
