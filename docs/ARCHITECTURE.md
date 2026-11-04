# Architecture

## Overview
```
Browser (Angular + PrimeNG, static)  --HTTPS-->  Supabase (Auth + Postgres + RLS)
        ^                                              ^
        | served by                                     | service role key (server side only)
Cloudflare Pages                              GitHub Actions (Python jobs)
                                                |  AMFI NAV file, price providers, FX
                                                +--> weekly encrypted backup (private repo)
```
There is no custom backend. The browser talks to Supabase directly using the anon key; Row Level Security (RLS) ensures only the signed-in owner can read or write their rows. Jobs that need to write shared market data (NAVs, prices, FX) run in GitHub Actions with the service role key.

## Repo layout
```
web/
  src/app/
    core/        auth, supabase client, data services, calc (pure functions), db.types.ts
    features/    overview/ mutual-funds/ stocks/ rsu/ savings/ cards/ settings/ login/
    shared/      ui components, pipes, directives, layout (shell, sidebar, bottom-nav)
scripts/
  jobs/          fetch_nav.py fetch_prices.py snapshot.py backup.py
  tests/         pytest (including RLS tests)
supabase/migrations/   0001_init.sql, ...
.github/workflows/     ci.yml nav.yml prices.yml backup.yml
docs/
```

## Data flow
1. **Holdings** (units, invested, quantity, balances) are entered by the owner (through the UI, or loaded by the owner directly into Supabase). Stored in owner tables.
2. **Market data** (latest NAV, latest stock price, USD/INR) is written by jobs through SQL functions into small "latest only" tables that any signed-in user can read (they hold no personal data and keep no history; each row stores the latest and the previous value so "today's change" works).
3. **Valuation** is computed from holdings joined to the latest market data, via SQL views (`v_mf_holdings`, `v_stock_holdings`, `v_card_bills`) and pure TypeScript functions for totals, scoped to the selected portfolio or all portfolios.
3a. **Portfolios** are labels under the one owner login (for example Me, Wife). There are no per-portfolio logins.
4. **Snapshots**: a daily job stores total values in `portfolio_snapshots` for history charts.

## Frontend design
- Standalone Angular components, signals, OnPush, lazy-loaded routes per feature.
- A data service per feature wraps `supabase-js` calls and exposes signals (`data`, `loading`, `error`). Services re-query when `RefreshService.tick` changes (the top bar Refresh button) and call `markUpdated()` for the "Updated" time.
- Auth: `core/auth/AuthService` holds the session as signals. Sign-in is an email magic link using the PKCE flow (`shouldCreateUser: false`); supabase-js persists the session in localStorage and refreshes the token, and a failed refresh (SIGNED_OUT) returns to `/login`. `authGuard` protects every app route and strips the used `?code=` from the URL; `guestGuard` keeps signed-in users off the login page. Sign-out is global (revokes all sessions).
- Portfolio scope: `core/data/PortfolioService` exposes `scope()` (null = All) and `scopeIds()`; the choice is saved in `settings` (key `portfolio_scope`) so it follows the owner across devices.
- Calculation functions are pure and unit tested; components only render. They live in `core/calc/`: `common.ts` (valuation, totals, portfolio scope, dates, staleness), `mf.ts`, `stocks.ts` (INR/USD), `rsu.ts`, `savings.ts`, `cards.ts` (due dates, bill status, dues, next due, creating a month's bills). Each takes plain rows plus the portfolio ids in scope (`PortfolioService.scopeIds()`), so one function serves a single portfolio, All, and the per-portfolio rows of the Overview table. The browser computes bill status with its local date, so it can differ from `v_card_bills` (database date, UTC) for a few hours around midnight; the UI uses the TypeScript status. `npm run test:coverage` enforces at least 90% coverage of `core/calc` in CI.
- Responsive shell: `ShellComponent` chooses sidebar vs bottom nav using CSS (media queries) and a `BreakpointService` (signal) for behaviour differences such as table vs card list.
- Theming: PrimeNG Aura preset, dark mode via `.app-dark` class on `<html>`.
- Charts: Chart.js directly through a shared `app-chart` component (register only the controllers used, so the bundle stays small); colors from CSS variables so both themes work. PrimeNG Chart is not used because it is deprecated in favor of paid PRO Charts.
- Tables: feature pages use the shared `DataTable` wrapper around PrimeNG Table, so the table implementation can be swapped in one place.

## Jobs
| Job | Schedule | Writes | Notes |
|---|---|---|---|
| fetch_nav | daily, 18:00 and 01:30 UTC | `mf_nav_latest` via `upsert_mf_nav` | Only schemes in `mf_holdings`; no history stored; writes unmatched codes as JSON in `job_runs.message` (see DATA_MODEL.md) |
| fetch_prices | weekdays after market close | `stock_price_latest`, `fx_latest` via upsert functions | Provider interface with fallback; skips manual overrides |
| snapshot | daily after prices | `portfolio_snapshots` | One row per portfolio per day, upsert |
| backup | weekly | private repo or artifact | `age` encrypted JSON |
| keepalive | weekly | none | simple select |
Every job records a row in `job_runs`.

## Environments
- `local`: Supabase CLI local stack (`npx supabase start` at the repo root; Docker required). It applies `supabase/migrations/` and mirrors the production auth/API settings from `supabase/config.toml`. Database tests and type generation run against it by default. Never test against production data with destructive scripts.
- `production`: the live Supabase project and Cloudflare Pages.

## Decisions log
- Static SPA (no SSR) to stay free and simple.
- No custom API: RLS is the authorization layer.
- Python for jobs: parsing and data scripts are simpler there; frontend stays pure TypeScript.
- PrimeNG kept under its free Community License; Chart.js used directly instead of PrimeNG Chart (moving to PRO).
