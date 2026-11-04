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
- Data API: **enabled** (supabase-js and the jobs use it).
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

## Web hardening (Cloudflare `_headers`)
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://YOUR-PROJECT.supabase.co wss://YOUR-PROJECT.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```
Adjust the CSP if Angular or PrimeNG needs additional sources, but never use `unsafe-eval` and never allow `*` for `script-src`.
Add `<meta name="robots" content="noindex,nofollow">` and a `robots.txt` that disallows all.

## Data handling
- The service worker must never cache Supabase API responses.
- No analytics or third-party trackers.
- No financial values in URLs, logs or error reports.
- Backups are encrypted with `age` before leaving GitHub runners; keep the private key offline (password manager).

## Checklist (tick before go-live)
- [ ] Sign-up disabled; only one user exists
- [ ] RLS enabled on every table, verified by `scripts/tests/test_rls.py`
- [ ] An unauthenticated request to every table returns no data
- [ ] "Automatically expose new tables" is off and anon has no table privileges
- [ ] anon and authenticated roles cannot execute the `upsert_*` functions
- [ ] Service role key absent from `web/` and from the build output (grep the `dist` folder)
- [ ] Security headers present (check with securityheaders.com or curl)
- [ ] Auth redirect URLs limited to the production domain and localhost
- [ ] MFA enabled for the owner (recommended)
- [ ] Backup restore tested once
- [ ] Dependabot or Renovate enabled for npm and pip
