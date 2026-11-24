# Security requirements

This app holds personal financial data. Treat security as a feature.

## Access control
- Supabase Auth: public sign-up **disabled**. One owner user, created manually.
- Optional but recommended: enable MFA (TOTP) for the owner in Supabase Auth.
- Optional extra layer: Cloudflare Access (free) in front of the site.
- Every owner table (including `pf_entries`, `ppf_entries`, `nps_holdings`, `nps_contributions`, `fixed_deposits`, `dividends`, `mf_transactions` and the employee equity ledger): `alter table ... enable row level security;` plus policies `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- Shared market-data tables (no `owner_id`; they hold no personal data), RLS enabled on all: `stock_price_latest`, `fx_latest` and `nps_nav_latest` let role `authenticated` read and write, so the owner can set manual overrides (`is_manual = true`) for a stock price, the USD/INR rate or an NPS NAV. `mf_nav_latest` and `job_runs` are **read-only** for `authenticated` (select policy, write privileges revoked in `0003`): only the jobs write them, with the service role. Jobs write through the `upsert_*` functions, which only the `service_role` may execute (`security definer`, EXECUTE revoked from public, anon and authenticated) and which never overwrite `is_manual` rows.
- `job_triggers` (Run now lock): RLS enabled; `authenticated` may only **select**. Writes happen only through `claim_job_trigger` and `release_job_trigger` (`security definer`, fixed 30-minute lock, allowlisted job names, refuse a caller without `auth.uid()`). EXECUTE is granted to `authenticated` and revoked from public and anon.
- `rls_auto_enable()` (created by Supabase's Automatic RLS setting, not by the migrations): EXECUTE revoked from public, anon and authenticated (`0003`), so it is not callable through `/rest/v1/rpc`.
- Security Advisor warnings that remain on purpose: `authenticated_all` on `stock_price_latest` and `fx_latest` (manual overrides), and `claim_job_trigger` / `release_job_trigger` executable by authenticated (the Run now lock; `security definer` so the table itself stays read-only). Leaked password protection does not apply: sign-in is by email code only.
- Privileges are granted explicitly in the migrations: `authenticated` gets select/insert/update/delete, `service_role` gets all, `anon` gets nothing (all privileges revoked). RLS then decides which rows.
- Portfolios are labels under one owner, so no extra access rules are needed. If a second login is ever added, this design must be revisited.
- Employee equity sale tables are readable under owner RLS. Sale RPCs verify the caller and lock the owned portfolio before committing sale and allocation writes together. Other ledger writes use RLS and the same portfolio lock. Composite foreign keys enforce ownership and portfolio consistency. The ledger export uses caller permissions.
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
- The local CAS importer reads the service-role key from `scripts/.env.prod` or the process environment; the PDF is parsed on the owner's machine and is never uploaded. Preview output includes the target host, selected portfolio and its folios, fund position names, closing units and cost, plus row counts; it does not print individual transactions, the PDF password or credentials. The importer includes zero-unit positions and filters out STT, stamp duty and miscellaneous ledger rows. The database prevents a transaction upsert from moving it to another portfolio. Writes require `--apply` plus an interactive `IMPORT` confirmation, and statement contents are never recorded in `job_runs` or logs.
- Job logs and `job_runs` messages hold counts, codes and symbols only, never keys or row contents. The backup is encrypted in memory before it is written, so no plaintext copy exists on the runner's disk or in the artifact.
- The Run now Worker holds `GITHUB_TOKEN`: a **fine-grained** personal access token for this repository only, with **Actions: read and write** and nothing else, and an expiry date. It is a Cloudflare Worker secret (never in `web/src`, `.env` or git). The worst a stolen token can do is start or cancel workflow runs; it cannot read code or secrets. The Worker has no Supabase service role key: it calls the database with the caller's own token, so an anonymous or forged request is refused by PostgREST before anything is dispatched. Each job can be dispatched at most once per 30 minutes, which caps any abuse of a stolen session. The Worker logs status codes only.
- SonarQube Cloud (code analysis, report only) receives the source code and coverage reports from CI, never data: the integration job runs against the throwaway local stack, and `SONAR_TOKEN` (GitHub secret) can only submit analyses for this project. Workflows from forks get no secrets, so the scan skips there.
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
The `_headers` file covers static assets only. The Worker sets its own headers on `/api` responses (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, JSON only). The app calls `/api` on its own origin, so `connect-src 'self'` already allows it.
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
- [ ] Backup restore tested once (restore tool tested on the local stack with encrypted backups in `test_restore.py`; **human:** rehearse with a real backup, docs/RUNBOOK.md › Rehearse a restore)
- [x] Renovate enabled for npm, pip and GitHub Actions (`renovate.json`; the app is installed and has opened its Dependency Dashboard)
