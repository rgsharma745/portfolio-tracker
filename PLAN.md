# PLAN.md: Implementation plan

Goal: replace the Google Sheet "Portfolio" with a secure, free, responsive website (desktop and mobile) backed by Supabase, with daily automatic NAV and price updates.

Legend: `[ ]` todo, `[x]` done. **Human** = a task only the owner can do. Stop at the end of every phase for review.

## Scope
**v1 (this plan):** Overview, Mutual Funds (per portfolio), Stocks (India, US), RSU, Savings, Credit Cards, Settings, auth, daily NAV/price jobs, daily snapshots (history chart), monthly credit card bills, backups, PWA.
**Backlog (v2, do not build now):** FD, PF, PPF, NPS, LIC, Term insurance, Loans, Dividends, Realized profit, SIP tracker, XIRR, Expenses, ESPP wallet.

## Assumptions (confirm with the owner if any is wrong)
- One login (the owner). No public sign-up. Several **portfolios** (for example Me and Wife) live under that one login; there are no per-portfolio logins.
- Amounts are INR unless the row is a US stock or RSU (USD, converted using a stored USD/INR rate).
- `MF`, `MF2`, `MF3` (and `Stocks`, `Stocks2`, `Stocks3`) are different people's portfolios, not duplicates. They become rows in the `portfolios` table. Default totals are the **family total (All portfolios)**, with a switcher for one portfolio. Confirm names and the Stocks mapping with the owner in Phase 3.
- No transaction ledger and no NAV/price history. Holdings are entered as units and invested amount; market data is latest-only (see `docs/DATA_MODEL.md`).
- Credit cards are managed monthly: one bill per card per month that can be marked paid.
- Free tiers only: Supabase Free, Cloudflare Pages Free, GitHub Actions Free.

---

## Phase 0: Prerequisites (Human)
- [ ] **Human:** Create a GitHub repo (private) and push this folder as the first commit.
- [ ] **Human:** Create a Supabase project (free). Note project URL, anon key, service role key.
- [ ] **Human:** In Supabase Auth settings: disable "Allow new users to sign up". Enable email magic link (and optionally Google). Create the owner user manually (Auth > Users > Add user). Copy the user UUID.
- [ ] **Human:** Create a Cloudflare account and a Pages project connected to the GitHub repo (settings are filled in Phase 9).
- [x] Add `.gitignore` (node_modules, dist, `.env*` except `.env.example`, `scripts/data/`, `__pycache__`, `.angular`).

**Acceptance:** repo exists, Supabase project exists with sign-up disabled, owner user exists.

## Phase 1: Scaffold the frontend
- [x] Create the Angular app in `web/` (standalone, routing, SCSS, strict TS, no SSR).
- [x] Install PrimeNG with the Aura theme and `@primeng/themes`; configure light and dark mode via a CSS class on `<html>` (`.app-dark`), initial value from `prefers-color-scheme`.
- [x] Install Tailwind CSS (layout utilities only) and make sure it does not conflict with PrimeNG styles (use CSS layers as documented by PrimeNG).
- [x] Install `@supabase/supabase-js`, Chart.js, and testing tools (unit + Playwright).
- [x] Environment handling: read `NG_APP_SUPABASE_URL` and `NG_APP_SUPABASE_ANON_KEY` at build time (document the chosen approach in AGENTS.md commands).
- [x] Set up ESLint, Prettier, and a GitHub Actions CI workflow (`.github/workflows/ci.yml`: install, lint, test, build) on every pull request.
- [x] Create folder structure from AGENTS.md (`core/`, `features/`, `shared/`).

**Acceptance:** `npm start` shows a blank themed shell; `npm run build` and CI pass.

## Phase 2: Database and security
- [ ] Review `supabase/migrations/0001_init.sql`; adjust to `docs/DATA_MODEL.md` if they differ and keep both in sync.
- [ ] **Human:** Apply the migration (Supabase SQL editor or `supabase db push` with the CLI).
- [ ] Generate TypeScript types into `web/src/app/core/db.types.ts` and add an npm script `gen:types`.
- [ ] Test the market-data upsert functions (`scripts/tests/test_upserts.py`): a newer date moves the old value into `prev_*`; the same date corrects the value without moving it; an older date is ignored; the anon and authenticated roles cannot execute the functions; a row with `is_manual = true` is not overwritten by `upsert_stock_price`.
- [ ] Write an RLS test script (`scripts/tests/test_rls.py`): with the anon key and no login every table returns nothing or is rejected; with a second throwaway user (created in the test, deleted after) owner tables return zero rows of the owner's data.
- [ ] Confirm views use `security_invoker = true`.

**Acceptance:** all tables have RLS enabled; RLS tests pass; an unauthenticated REST call returns no data.

## Phase 3: Data loading (done by the owner, no import tooling)
The owner loads their own data into Supabase. **Do not write an import script or read the Google Sheet.**
- [ ] Write `docs/DATA_ENTRY.md` (already provided as a starting point; keep it accurate): table order, required columns, CSV headers for Supabase's table-editor CSV import, and SQL snippets for tables that reference other tables.
- [ ] First-run experience in the app: when `portfolios` is empty show a welcome screen ("Create your first portfolio"); when a page has no holdings show an empty state with an Add button, so the app is fully usable even if the owner types everything in through the UI.
- [ ] Add a "Data check" section in Settings listing problems the owner can fix: funds with no `scheme_code`, funds whose `scheme_code` was not found in the latest AMFI file (the NAV job writes these into `job_runs.message`), stocks without a price, cards with no bill day or due day.
- [ ] **Human:** load the data (CSV import, SQL, or the app's forms) and compare totals with the Google Sheet. Mapping hints are in `docs/SHEET_MAPPING.md`.

**Acceptance:** the app works from an empty database; the Data check lists any holdings the jobs cannot price.

## Phase 4: Auth and app shell (responsive)
- [ ] Supabase auth service (signal-based session), login page (email magic link; Google button if enabled), route guard for all pages, logout.
- [ ] App shell: desktop >= 1024px = left sidebar; mobile = bottom tab bar (Overview, MF, Stocks, More) and a "More" sheet (RSU, Savings, Cards, Settings). Top bar with page title, refresh button, theme toggle, "last updated" time.
- [ ] Global components: `MoneyPipe` (INR en-IN / USD), `PlColorDirective` (green positive, red negative, neutral zero), `StatCard`, `EmptyState`, `ErrorState`, skeleton loaders.
- [ ] Portfolio switcher in the top bar (All, then one entry per active portfolio), persisted in `settings`; every page's data and totals respect it. Default is All.
- [ ] Session persistence and auto-refresh of tokens; sign out when token is invalid.

**Acceptance:** unauthenticated users only see login; layout switches correctly at 767/768 and 1023/1024 px; no horizontal scroll at 360px.

## Phase 5: Core calculations (pure functions + tests)
- [ ] `core/calc/mf.ts`, `stocks.ts`, `rsu.ts`, `savings.ts`, `cards.ts` implementing formulas in `docs/DATA_MODEL.md` ("Calculations" and "Credit card bills"), including portfolio-scoped totals (one portfolio or all active).
- [ ] Unit tests with fixtures including: missing NAV, stale NAV date, zero units, negative P&L, USD conversion, RSU with partial vesting, card due-date computation (due day before and after bill day, short months), bill status (awaiting, unpaid, partial, paid, overdue), and totals across several portfolios.

**Acceptance:** all calculation tests pass; coverage of `core/calc` at least 90%.

## Phase 6: Feature pages
Build each page per `docs/UI_SPEC.md`. For every page: loading, empty and error states; desktop table + mobile card list; Playwright screenshots at 390x844 and 1440x900.
- [ ] **Overview:** stat cards (MF value, MF today, Stocks value, Stocks today, RSU vested value, Savings, Card dues, Combined) for the selected portfolio or All, allocation donut chart, summary table with one row per portfolio plus a family total row, history line chart from `portfolio_snapshots`.
- [ ] **Mutual Funds:** uses the portfolio switcher (All or one portfolio; in All mode show a portfolio column/tag), totals (current, invested, P&L and %, today), search, sort, column totals footer, NAV date shown with a stale-NAV badge, add/edit/delete holding dialog (portfolio, scheme code, units, invested, folio; the scheme code field explains where to find the AMFI code, and a fund-name search is optional: only add it if a free source such as mfapi.in is allowed in the CSP, and ask the owner first), CSV export.
- [ ] **Stocks:** India and US tabs, same totals, quantity/avg price edit, USD to INR display toggle.
- [ ] **RSU:** grants table, cards for total value (after tax INR), USD pre/after tax, vested value INR, current price, units (total, vested, sellable, pending, sold for tax). Edit grants.
- [ ] **Savings:** accounts list with balance share bar, inline balance edit, add/delete account, total.
- [ ] **Cards (monthly management):** month selector (default current month), bills for that month with status chips (awaiting, unpaid, partial, paid, overdue), a section for unpaid bills from earlier months, "Create this month's bills" (rows with no amount for every active card), enter or edit a bill amount, **Mark paid** (full) and record a partial payment, notes, manage cards (add, edit bill/due day, deactivate). Summary cards: total pending, bills awaiting a statement, next due (red if within 3 days or overdue). Rules in `docs/DATA_MODEL.md`.
- [ ] **Settings:** manage portfolios (add, rename, reorder, deactivate; delete only with a strong confirmation), theme, manual price override (stock or FX), last job runs, data export (JSON), sign out.

**Acceptance:** each page matches `UI_SPEC.md`; totals equal the Google Sheet's within rounding for the same date's NAVs; all pages pass the responsive checks.

## Phase 7: Scheduled jobs
Put code in `scripts/jobs/`, workflows in `.github/workflows/`. All jobs use the service role key from GitHub Secrets and are idempotent.
- [ ] `fetch_nav.py` + `nav.yml`: download AMFI `NAVAll.txt` (https://www.amfiindia.com/spages/NAVAll.txt), parse (`;` separated: scheme code; ISIN payout; ISIN reinvest; scheme name; NAV; date), for only the scheme codes present in `mf_holdings`, call the SQL function `upsert_mf_nav(code, nav, date)` via Supabase RPC (service role). Never store NAV history; the function keeps the latest and previous value only. Schedule: daily at 23:30 IST and a retry at 07:00 IST (GitHub cron is UTC: 18:00 and 01:30). Handle holidays (no new date = no new rows, not an error).
- [ ] `fetch_prices.py` + `prices.yml`: stock prices behind a `PriceProvider` interface. Default provider: choose the most reliable free source at implementation time (for example NSE/BSE bhavcopy for India, and a free quote source for US); document the choice and add a fallback. Write results with `upsert_stock_price(...)` and fetch USD/INR with `upsert_fx_rate(...)`; skip symbols whose row has `is_manual = true`. Schedule: weekdays after Indian market close and after US close.
- [ ] `snapshot.py`: compute and upsert one row per portfolio per day into `portfolio_snapshots` (uses the same formulas as the frontend; share logic via SQL view or duplicate with tests that compare).
- [ ] `backup.py` + `backup.yml`: weekly export of all owner tables to JSON, encrypt with `age` using `BACKUP_AGE_RECIPIENT`, commit to a separate PRIVATE backup repo (or upload as a workflow artifact with 90-day retention if the owner prefers).
- [ ] Keep-alive: the daily NAV job already counts as activity, but also run a trivial query weekly so the free project is never paused.
- [ ] Failure notification: workflow failure emails the owner (GitHub default) and also write a `job_runs` row (name, status, message, time). Show last-run status in Settings.

**Acceptance:** manual `workflow_dispatch` of each job succeeds; re-running creates no duplicates; NAV date shown in the MF page advances.

## Phase 8: PWA, accessibility, performance
- [ ] PWA: manifest, icons, service worker (cache app shell only, never cache API responses containing financial data), installable on iOS and Android.
- [ ] Accessibility: keyboard navigation, focus states, labels on icon buttons, contrast AA in both themes, color is never the only signal for gain/loss (also show +/- sign).
- [ ] Performance: lazy-load feature routes, initial JS under ~300 KB gzip, Lighthouse mobile performance >= 90.
- [ ] Privacy mode: a "hide amounts" toggle (masks all money values with ••••) persisted locally, useful in public.

## Phase 9: Deploy
- [ ] Cloudflare Pages build settings: root `web`, build `npm ci && npm run build`, output `dist/<app>/browser`, set `NG_APP_*` env vars.
- [ ] Add SPA fallback (`_redirects`: `/* /index.html 200`) and security headers (`_headers`) per `docs/SECURITY.md` (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors none).
- [ ] **Human:** add GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `BACKUP_AGE_RECIPIENT`.
- [ ] Optionally restrict access further with Cloudflare Access (free for up to 50 users) in front of the site.
- [ ] Supabase Auth: set Site URL and redirect URLs to the deployed domain.

**Acceptance:** production site loads over HTTPS, login works from phone and desktop, jobs run on schedule.

## Phase 10: QA and cutover
- [ ] Full Playwright suite on Chromium plus WebKit mobile emulation; manual test on a real phone.
- [ ] Reconcile: compare Overview totals with the Google Sheet for the same day (MF, Stocks, RSU, Savings, Card dues).
- [ ] Security checklist in `docs/SECURITY.md` fully ticked.
- [ ] Write `docs/RUNBOOK.md`: how to restore from backup, rotate keys, add a new fund, fix a failed job.
- [ ] **Human:** run both systems in parallel for 1 to 2 weeks, then retire the sheet (keep it read-only as an archive).

**Acceptance:** totals reconcile; owner signs off.

---

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Free stock price sources are unofficial or break | `PriceProvider` interface, fallback provider, manual price override column, job-failure notification |
| Fund name to AMFI code mismatch | Strict matching, `unmatched.csv`, owner confirms |
| Supabase free project pausing | Daily jobs + weekly keep-alive |
| Data loss | Weekly encrypted backup, `docs/RUNBOOK.md` restore steps |
| Financial data in a public site | RLS on every table, sign-up disabled, optional Cloudflare Access, no data caching in service worker |
