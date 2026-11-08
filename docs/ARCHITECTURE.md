# Architecture

## Overview
```
Browser (Angular + PrimeNG, static)  --HTTPS-->  Supabase (Auth + Postgres + RLS)
        ^      |                                       ^      ^
        |      | POST /api/jobs/:job (owner's token)    |      | claim_job_trigger (owner's token)
        |      v                                       |      |
Cloudflare Workers (static assets + /api Worker) -----+------+
                       |  workflow_dispatch (GITHUB_TOKEN)
                       v                       | service role key (server side only)
                 GitHub Actions (Python jobs) -+
                       |  AMFI NAV file, price providers, FX
                       +--> weekly encrypted backup (GitHub artifact, 90 days)
```
There is no custom data backend. The browser talks to Supabase directly using the anon key; Row Level Security (RLS) ensures only the signed-in owner can read or write their rows. Jobs that need to write shared market data (NAVs, prices, FX) run in GitHub Actions with the service role key.

## Repo layout
```
web/
  src/app/
    core/        auth/ (session, guards), data/ (Supabase client and services), calc/ (pure
                 functions + tests), pwa/ (update banner service), theme/ (PrimeNG preset), db.types.ts
    features/    overview/ mutual-funds/ stocks/ rsu/ savings/ cards/ settings/ login/ welcome/
    shared/      ui/ (DataTable, dialogs, stat cards, chart, …), layout/ (shell, nav), format/ (money,
                 privacy, csv, sort, validation)
  worker/        Cloudflare Worker for /api/* (jobs.ts: Run now), its tests and tsconfig
  e2e/           Playwright specs (mobile, desktop, iPhone WebKit; accessibility.spec.ts runs axe)
  scripts/       build and local-dev helpers: set-env, write-headers (CSP), local-stack/-user/-seed,
                 make-icons, check-bundle-secrets
  public/        manifest, icons, robots.txt
  ngsw-config.json, wrangler.jsonc (Cloudflare Workers static assets)
scripts/
  jobs/          fetch_nav.py fetch_nps_nav.py fetch_prices.py providers.py snapshot.py backup.py keepalive.py
  tools/         restore.py (restore a backup; run by hand, never scheduled)
  lib/           supabase_rest.py (REST client), jobs.py (run_job, job_runs), http.py, calc.py
  tests/         pytest (RLS, upserts, jobs, parsers, formula parity, restore)
supabase/        migrations/ (0001_init.sql, …), templates/magic_link.html, config.toml (local stack)
.github/workflows/  ci.yml, _run-job.yml (shared), nav.yml prices.yml snapshot.yml backup.yml keepalive.yml
docs/
renovate.json    dependency updates (Renovate app)
```

## Data flow
1. **Holdings** (units, invested, quantity, balances) are entered by the owner (through the UI, or loaded by the owner directly into Supabase). Stored in owner tables.
2. **Market data** (latest NAV, latest stock price, USD/INR) is written by jobs through SQL functions into small "latest only" tables that any signed-in user can read (they hold no personal data and keep no history; each row stores the latest and the previous value so "today's change" works).
3. **Valuation** is computed from holdings joined to the latest market data, via SQL views (`v_mf_holdings`, `v_stock_holdings`, `v_card_bills`) and pure TypeScript functions for totals, scoped to the selected portfolio or all portfolios.
3a. **Portfolios** are labels under the one owner login (for example Me, Wife). There are no per-portfolio logins.
4. **Snapshots**: a daily job stores total values in `portfolio_snapshots` for history charts.

## Frontend design
- Standalone Angular components, signals, OnPush, lazy-loaded routes per feature.
- The Supabase client (`core/data/supabase.client.ts`) is built from Supabase's `@supabase/auth-js` and `@supabase/postgrest-js` with the same settings `createClient` would use (session storage key, PKCE, token on every request). The full `supabase-js` also bundles realtime, storage and functions clients the app never uses (~120 kB in the first download), so it is not installed; add it back only if one of those is needed.
- Data services in `core/data/` wrap the client and expose signals (`loading`, `error`, `loaded`): `HoldingsService` loads funds, stocks, RSU grants, savings and the latest NAVs, prices and USD/INR together (a few dozen rows, shared by every page so totals always agree); `CardsService` loads cards and bills; `SnapshotsService` the daily history; `MarketService` manual price overrides and job runs; `ExportService` the JSON export. Services re-query when `RefreshService.tick` changes (the top bar Refresh button) and call `markUpdated()` for the "Updated" time.
- Auth: `core/auth/AuthService` holds the session as signals. Sign-in is an email magic link using the PKCE flow (`shouldCreateUser: false`); the same email carries a 6 to 10 digit code (the project's OTP length) (`verifyOtp`, type `email`) for the app installed on an iPhone home screen, which has its own storage, so a link that opens in Safari would sign in Safari instead; auth-js persists the session in localStorage and refreshes the token, and a failed refresh (SIGNED_OUT) returns to `/login`. `authGuard` protects every app route and strips the used `?code=` from the URL; `guestGuard` keeps signed-in users off the login page. Sign-out is global (revokes all sessions).
- Portfolio scope: `core/data/PortfolioService` exposes `scope()` (null = All) and `scopeIds()`; the choice is saved in `settings` (key `portfolio_scope`) so it follows the owner across devices.
- Calculation functions are pure and unit tested; components only render. They live in `core/calc/`: `common.ts` (valuation, totals, portfolio scope, dates, staleness), `mf.ts`, `stocks.ts` (INR/USD), `rsu.ts`, `savings.ts`, `cards.ts` (due dates, bill status, dues, next due, creating a month's bills). Each takes plain rows plus the portfolio ids in scope (`PortfolioService.scopeIds()`), so one function serves a single portfolio, All, and the per-portfolio rows of the Overview table. The browser computes bill status with its local date, so it can differ from `v_card_bills` (database date, UTC) for a few hours around midnight; the UI uses the TypeScript status. `npm run test:coverage` enforces at least 90% coverage of `core/calc` in CI.
- Responsive shell: `ShellComponent` chooses sidebar vs bottom nav using CSS (media queries) and a `BreakpointService` (signal) for behaviour differences such as table vs card list.
- Theming: PrimeNG Aura preset, dark mode via `.app-dark` class on `<html>`.
- Privacy mode: `shared/format/privacy.ts` holds one signal; `formatMoney` returns •••• while it is on, so every amount (pipe, tables, cards, chart tooltips, aria labels) follows. The `money` pipe is impure so it re-runs on toggle.
- PWA: `@angular/service-worker` (production build only, `ngsw-config.json`) prefetches the app's own files so it opens offline and installs on iOS and Android (`public/manifest.webmanifest`, icons from `scripts/make-icons.mjs`). There are no data groups, so Supabase responses are never cached. `core/pwa/AppUpdateService` (created with the root component, so it never misses the worker's "ready" message) checks for a new deploy at startup, on returning to the app and every 30 minutes while visible, and the root component shows a Reload banner once it is downloaded.
- Charts: Chart.js directly through the shared `app-line-chart` component; the allocation is a plain segmented bar (`app-allocation-bar`), no chart library (register only the controllers used, so the bundle stays small); colors from CSS variables so both themes work. PrimeNG Chart is not used because it is deprecated in favor of paid PRO Charts.
- Tables: feature pages use the shared `DataTable` wrapper around PrimeNG Table, so the table implementation can be swapped in one place.

## Jobs
| Job | Schedule | Writes | Notes |
|---|---|---|---|
| fetch_nav (`nav.yml`) | daily 23:37 and 08:17 IST (Cloudflare Cron Trigger) | `mf_nav_latest` via `upsert_mf_nav` | AMFI `NAVAll.txt` (https://portal.amfiindia.com/spages/NAVAll.txt; the old amfiindia.com URL redirects there). Only scheme codes in `mf_holdings`; no history; unmatched codes go in the JSON message |
| fetch_nps_nav (`nav.yml`, second job) | with fetch_nav | `nps_nav_latest` via `upsert_nps_nav` | NPS Trust's latest-NAV export (https://npstrust.org.in/nav-report-excel, tab-separated, every scheme), falling back to Protean CRA's daily file (`https://www.npscra.proteantech.in/download/NAV_File_DDMMYYYY.zip`, looking back a week). Only scheme codes in `nps_holdings`; skips `is_manual` rows; runs independently of fetch_nav, so one failing does not stop the other |
| fetch_prices (`prices.yml`) | 19:13 IST Mon–Fri and 04:23 IST Tue–Sat, after the US close (Cloudflare Cron Trigger) | `stock_price_latest`, `fx_latest` via upsert functions | Only symbols in `stock_holdings` and `rsu_grants`; USD/INR only when something is in USD; skips `is_manual` rows. Sources below |
| snapshot (`snapshot.yml`) | right after the morning NAV run (`workflow_run`; fallback schedule 08:37 IST) | `portfolio_snapshots` | One row per active portfolio per day (IST date), upsert; formulas in `scripts/lib/calc.py` |
| backup (`backup.yml`) | Sundays 08:41 IST | workflow artifact, 90 days | All owner tables as JSON, encrypted with `age` in memory before writing |
| keepalive (`keepalive.yml`) | Wednesdays 11:19 IST | none | One tiny select so the free project never pauses |

Schedules are written in IST (`timezone: Asia/Kolkata` on each cron) at odd minutes: GitHub delays, and under heavy load drops, scheduled runs, most of all at the start of the hour. A late or missing run can be started from Settings › Job runs › Run now.

Every job records one `job_runs` row (status, JSON summary or the error, start and finish time) and exits non-zero on failure, so GitHub emails the owner; Settings › Job runs shows the last run of each. All jobs are idempotent: re-running a day changes nothing or replaces that day's values. The scheduled workflows share `.github/workflows/_run-job.yml` and need the GitHub secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and `BACKUP_AGE_RECIPIENT` for backups). Each can also be run by hand (`workflow_dispatch`).

**On-time starts (Cloudflare Cron Triggers):** GitHub's `schedule` runs often start 3–7 hours late, and some are dropped (seen on every workflow, 5–7 Nov 2026). So the Worker's `scheduled` handler (`web/worker/schedule.ts`) starts `nav.yml` and `prices.yml` with workflow_dispatch at the times above; GitHub runs a dispatched workflow within about a minute. The crons are in `web/wrangler.jsonc` `triggers.crons`, in UTC (IST − 5:30): `7 18 * * *` and `47 2 * * *` for NAVs, `43 13 * * MON-FRI` and `53 22 * * MON-FRI` for prices (4 of the 5 Cron Triggers Workers Free allows per account). They use the Worker's `GITHUB_TOKEN` and `GITHUB_REPO`, and skip the Run now lock. The GitHub schedules stay as a fallback: the jobs are idempotent, so a late second run is harmless. `snapshot.yml` runs when a NAV run completes, gated to runs finishing 06:00–11:59 IST, so the day's row is written right after the morning NAVs; backup and keepalive are not time-sensitive and keep their GitHub schedules. A failed dispatch shows in Workers Logs (`schedule: GitHub did not start …`).

**Run now (from the website):** Settings › Job runs has a Run now button for NAVs (`fetch_nav`; it dispatches `nav.yml`, which also runs `fetch_nps_nav`) and prices (`fetch_prices`). It posts to the Worker at `/api/jobs/:job` (same origin, so the CSP is unchanged) with the owner's Supabase access token. The Worker (`web/worker/jobs.ts`):
1. Allows only `fetch_nav` → `nav.yml` and `fetch_prices` → `prices.yml`.
2. Calls `claim_job_trigger` through PostgREST with the anon key and the owner's token. A bad or expired token fails there (401), so this also checks the sign-in. The function takes the job's slot in `job_triggers` in one statement, or says when it frees up: a job can be triggered once every **30 minutes**. While locked the Worker answers 429 with `Retry-After`.
3. Dispatches the workflow on `main` with `GITHUB_TOKEN`. It answers 202 with the time the lock ends (and the run's link). If GitHub refuses, it calls `release_job_trigger` so the owner can retry at once, and answers 502.

The lock counts manual triggers only; scheduled runs do not take it. The workflows' `concurrency` group still queues a manual run behind a scheduled one. The app reads `job_triggers` to show "Available again at …", also for a run started from another device. Worker settings: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GITHUB_REPO` (text) and `GITHUB_TOKEN` (secret), set in Cloudflare and kept across deploys (`keep_vars`).

**Price sources** (`scripts/jobs/providers.py`, one `PriceProvider` interface):
- India stocks: NSE's official daily bhavcopy (one CSV of all closing prices; the job looks back over weekends and holidays), then Yahoo Finance (`SYMBOL.NS`) for any symbol it lacks.
- US stocks and RSU symbols: Yahoo Finance's chart endpoint. It is unofficial and may change; Stooq, the planned US source, now blocks scripts with a browser check. Alternatives if Yahoo breaks: a free Alpha Vantage or Finnhub key, or a published GOOGLEFINANCE price sheet.
- USD/INR: Frankfurter (European Central Bank reference rate), Yahoo `INR=X` as the fallback.
- The jobs send an honest User-Agent (`portfolio-tracker-jobs/1.0`) and never pose as a browser or get around a site's bot checks.

**Formula parity:** `scripts/lib/calc.py` repeats the app's valuation formulas for the snapshot. `web/src/app/core/calc/fixtures/snapshot-case.json` holds inputs and expected totals that both `scripts/tests/test_calc.py` and `core/calc/snapshot-parity.spec.ts` check, so a formula changed on one side only fails CI.

## Environments
- `local`: Supabase CLI local stack (`npx supabase start` at the repo root; Docker required). It applies `supabase/migrations/` and mirrors the production auth/API settings from `supabase/config.toml`. Database tests and type generation run against it by default. Never test against production data with destructive scripts.
- `production`: the live Supabase project and the Cloudflare Worker (static assets plus `/api`).

## Decisions log
- Static SPA (no SSR) to stay free and simple.
- No custom data API: RLS is the authorization layer. The one Worker endpoint (`/api/jobs/:job`) only starts a GitHub workflow; it reaches the database with the caller's own token, never the service role key.
- Python for jobs: parsing and data scripts are simpler there; frontend stays pure TypeScript.
- PrimeNG kept under its free Community License; Chart.js used directly instead of PrimeNG Chart (moving to PRO).
- Hosting on Cloudflare Workers static assets rather than Pages (Cloudflare's recommended path for new projects).
- First-load size: the PrimeNG theme lists only the components in use (`core/theme/preset.ts`; a new PrimeNG component needs its tokens added there), and the login page is not lazy, so a signed-out first visit paints after one script download.
