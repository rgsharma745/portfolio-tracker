# Security requirements

This app holds personal financial data. Treat security as a feature.

## Access control
- Supabase Auth: public sign-up **disabled**. One owner user, created manually.
- Optional but recommended: enable MFA (TOTP) for the owner in Supabase Auth.
- Optional extra layer: Cloudflare Access (free) in front of the site.
- Every owner table: `alter table ... enable row level security;` plus policies `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- Shared market-data tables (`mf_nav_latest`, `stock_price_latest`, `fx_latest`, `job_runs`): `select` for role `authenticated` only. The only owner write allowed is a manual price override row in `stock_price_latest` (`is_manual = true`). All other writes go through the `upsert_*` functions, which only the `service_role` may execute (`security definer`, EXECUTE revoked from public, anon and authenticated).
- Portfolios are labels under one owner, so no extra access rules are needed. If a second login is ever added, this design must be revisited.
- Views use `security_invoker = true` so they respect the caller's RLS.
- Never expose the `service_role` key to the browser.

## Secrets
- Frontend gets only the project URL and the anon key (safe by design when RLS is correct).
- Service role key, owner UUID and backup recipient live in GitHub Actions Secrets and a local `.env` (git-ignored).
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
- [ ] anon and authenticated roles cannot execute the `upsert_*` functions
- [ ] Service role key absent from `web/` and from the build output (grep the `dist` folder)
- [ ] Security headers present (check with securityheaders.com or curl)
- [ ] Auth redirect URLs limited to the production domain and localhost
- [ ] MFA enabled for the owner (recommended)
- [ ] Backup restore tested once
- [ ] Dependabot or Renovate enabled for npm and pip
