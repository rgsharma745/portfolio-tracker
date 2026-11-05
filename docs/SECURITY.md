# Security requirements

This app holds personal financial data. Treat security as a feature.

## Access control
- Supabase Auth: public sign-up **disabled**. One owner user, created manually.
- Optional but recommended: enable MFA (TOTP) for the owner in Supabase Auth.
- Optional extra layer: Cloudflare Access (free) in front of the site.
- Every owner table: `alter table ... enable row level security;` plus policies `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- Shared market-data tables (`mf_nav_latest`, `stock_price_latest`, `fx_latest`, `job_runs`): RLS enabled with one policy allowing role `authenticated` to read and write (no `owner_id`; they hold no personal data). This lets the owner set manual overrides (`is_manual = true`) for a stock price or the USD/INR rate. Jobs write through the `upsert_*` functions, which only the `service_role` may execute (`security definer`, EXECUTE revoked from public, anon and authenticated) and which never overwrite `is_manual` rows.
- Privileges are granted explicitly in the migrations: `authenticated` gets select/insert/update/delete, `service_role` gets all, `anon` gets nothing (all privileges revoked). RLS then decides which rows.
- Portfolios are labels under one owner, so no extra access rules are needed. If a second login is ever added, this design must be revisited.
- Views use `security_invoker = true` so they respect the caller's RLS.
- Never expose the `service_role` key to the browser.

## Supabase project settings (set when creating the project; keep `supabase/config.toml` in sync)
- Data API: **enabled** (the app and the jobs use it).
- Automatically expose new tables: **off**. New tables get no privileges until a migration grants them (`auto_expose_new_tables = false` locally).
- Automatic RLS: **on** (event trigger enables RLS on new public tables as a safety net).
- Auth: email provider on (magic link), "Allow new users to sign up" **off** (`enable_signup = false` locally), Site URL and redirect URLs limited to localhost and the production domain.
- GitHub integration: not connected. Migrations are applied manually after review.

## Sign-in behaviour
- Magic link only; the app never creates users (`shouldCreateUser: false`) and has no sign-up link.
- The login page shows the same "Check your email" message whether or not the address is registered, so it does not reveal which emails exist.
- PKCE flow: the one-time code in the link only works in the browser that requested it, and it is removed from the URL after use.
- Sign-out revokes all of the owner's sessions.

## Secrets
- Frontend gets only the project URL and the anon key (safe by design when RLS is correct).
- Service role key and backup recipient live in GitHub Actions Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_AGE_RECIPIENT`) and a local `.env` (git-ignored). The jobs do not need the owner's UUID: they read the owner's rows with the service role and keep each row's `owner_id`.
- Job logs and `job_runs` messages hold counts, codes and symbols only, never keys or row contents. The backup is encrypted in memory before it is written, so no plaintext copy exists on the runner's disk or in the artifact.
- Rotate keys if ever leaked. Run a secret scanner (gitleaks) in CI.

## Web hardening (Cloudflare `_headers`, served by Workers static assets)
`npm run build` writes `_headers` into the build output (`web/scripts/write-headers.mjs`), filling in the Supabase origin from `NG_APP_SUPABASE_URL`:
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://YOUR-PROJECT.supabase.co; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```
`style-src 'unsafe-inline'` is needed because PrimeNG writes its theme into `<style>` tags. The production build does not inline critical CSS: that feature adds an inline script, which `script-src 'self'` blocks (the page would load unstyled).
Adjust the CSP if Angular or PrimeNG needs additional sources, but never use `unsafe-eval` and never allow `*` for `script-src`.
Add `<meta name="robots" content="noindex,nofollow">` and a `robots.txt` that disallows all.

## Data handling
- The service worker must never cache Supabase API responses. `ngsw-config.json` has asset groups only (the app's own files) and no data groups, so every Supabase request goes to the network. Privacy mode only masks the screen; it is not access control.
- No analytics or third-party trackers.
- No financial values in URLs, logs or error reports.
- Backups are encrypted with `age` before leaving GitHub runners; keep the private key offline (password manager).

## Checklist (tick before go-live)
Production checked 5 Nov 2026 from outside with the public anon key only (read-only probe: auth settings, an anonymous read of every table and view, an anonymous call to `upsert_fx_rate`).
- [x] Sign-up disabled (`/auth/v1/settings`: `disable_signup: true`; only the email provider is on; anonymous and phone sign-in off)
- [x] Only one user exists (owner confirmed in Supabase › Authentication › Users, 5 Nov 2026)
- [x] RLS enabled on every table, verified by `scripts/tests/test_rls.py` (CI and the local stack, same migrations). Optional on production: see RUNBOOK "Check RLS on production"
- [x] An unauthenticated request to every table returns no data (production: all 13 tables and 3 views answer 401 `permission denied`)
- [x] anon has no table privileges (production: `42501 permission denied` for every table and view, and the OpenAPI listing is refused, so nothing is exposed to anon)
- [x] "Automatically expose new tables" is off (owner confirmed in Supabase › Project Settings › Data API)
- [x] anon and authenticated roles cannot execute the `upsert_*` functions (production: anon gets `permission denied for function upsert_fx_rate`; authenticated is covered by `test_upserts.py`)
- [x] Service role key absent from `web/` and from the build output (no `sb_secret_`, `service_role` or service JWT in `dist/` or tracked `web/` files; `set-env.mjs` refuses one)
- [x] Security headers present on the live site (curl, 5 Nov 2026: CSP, HSTS, X-Frame-Options DENY, nosniff, no-referrer, Permissions-Policy, X-Robots-Tag; no Cloudflare-injected scripts; `ngsw.json` no-cache)
- [x] Auth redirect URLs limited to the production domain and localhost (owner confirmed in Supabase › Authentication › URL Configuration)
- [x] MFA enabled for the owner (Supabase account, 5 Nov 2026)
- [ ] Backup restore tested once (a backup was decrypted on 5 Nov 2026; restoring into a database is a Phase 10 task)
- [x] Renovate enabled for npm, pip and GitHub Actions (`renovate.json`; the app is installed and has opened its Dependency Dashboard)
