# PLAN.md: Implementation plan

Goal: replace the Google Sheet "Portfolio" with a secure, free, responsive website (desktop and mobile) backed by Supabase, with daily automatic NAV and price updates.

Legend: `[ ]` todo, `[x]` done. **Human** = a task only the owner can do. Stop at the end of every phase for review.

## Status (update this when work lands)
_Last updated 11 Nov 2026._
- **Built:** phases 0 to 10. Live at https://portfolio-tracker.rgsharma745.workers.dev (Cloudflare Workers, deploys on push to `main`). Jobs run in GitHub Actions, started on time by Cloudflare Cron Triggers (Phase 15); backups are encrypted weekly artifacts; restore is `scripts/tools/restore.py`.
- **Checks:** lint, 347 unit tests + 17 Worker tests, 239 pytest, 93 Playwright tests (Chrome phone and desktop, WebKit iPhone; 3 skipped; parallel, about 2 min locally and 7 min on CI), axe WCAG 2.1 AA in both themes, Lighthouse on the live site 99–100 performance, 100 accessibility and best practices (SEO low on purpose: `noindex`). Security checklist in `docs/SECURITY.md` complete except the restore rehearsal.
- **Phase 11 (live, 6 Nov 2026):** Run now for NAVs and prices from Settings › Job runs, via a Cloudflare Worker at `/api/jobs/:job` with a 30-minute lock in Supabase. Migrations 0002 and 0003 applied to production; Worker token and variables set; More sheet redesigned as square tiles.
- **Phase 12 (live, 7 Nov 2026):** PF (provident fund) page, Overview PF card, allocation and history. Migrations 0004–0006 applied to production and the owner's PF data loaded (wage month Jan…Dec + wage year, transaction date on every row). Every date field is now the PrimeNG DatePicker (`app-date-input`). Workflow schedules are written in IST (`timezone: Asia/Kolkata`); CI caches Playwright browsers.
- **Phase 13 (live, 7 Nov 2026):** PPF page (investment and interest per financial year, ₹500 to ₹1.5 lakh limits flagged), Overview PPF card, allocation and history. Migration 0007 applied to production and the owner's PPF data loaded. `.gitignore` now ignores only the root `data/` (the old rule also hid new files in `web/src/app/core/data/`).
- **Phase 14 (live, 8 Nov 2026):** NPS page (Tier I: units per scheme E/C/G/A, self and employer contributions, per financial year, XIRR), daily NPS NAV job (NPS Trust, Protean fallback; runs inside `nav.yml`), Overview NPS card, allocation and history. Migration 0008 applied to production and the owner's NPS data loaded; value, per-year contributions and XIRR checked against the NPS statement (8 Nov 2026). Stat cards in a row now share one height on every page; allocation-bar labels meet 4.5:1 on every colour; the Overview note's link is underlined. PPF's per-year table dropped its Room left column (room left stays on the top card) and its phone cards list investment and interest on separate lines.
- **Phase 16 (live, 8 Nov 2026):** Fixed deposits page (maturity amount, days left with a term progress bar, matured and maturing-soon tags), Overview FD card, allocation and history. Migration 0009 applied to production and the owner's FDs added. The shared edit dialog's red Delete button now meets 4.5:1 in light mode.
- **Stocks mobile cards (live, 9 Nov 2026):** laid out like a broker's holdings card: `Qty. · Avg.` with the P&L %, the symbol with the current value in the P&L colour, `Invested` with `LTP` and today's %. Desktop shows `Qty:` instead of `sh`.
- **Maintenance (live, 9–10 Nov 2026):** Node 26 LTS for the Cloudflare build and CI (`web/.node-version`); its npm 11.20 skips dependency install scripts until approved, which the build does not need. Refresh shows it is working (the icon spins while data loads; `RefreshService.busy`). Day change reads "1 Day Change" everywhere (`1 Day Change: +₹144` inline; the Stocks CSV keeps `Today`). A late lock read no longer re-enables Run now. Playwright runs in parallel with users per worker (`e2e/support/fixtures.ts`): about 2 min locally instead of 7; on CI (2-core runner, private repo) 2 workers and a 60 s test timeout bring the suite from 12 to 7 min. SonarQube Cloud analysis in CI, report only (`sonar-project.properties`, RUNBOOK › SonarQube), with coverage merged from Vitest, the Playwright run (Chromium, `E2E_COVERAGE=1`) and pytest: about 82% against the gate's 80%. The first scan's security findings are fixed or explained (plain-http Supabase URLs refused, restore paths checked, a backtracking regex replaced). CI caches Playwright's apt downloads and installs age from its release. The reliability findings are fixed too (explicit sort compares, a seeded `reduce`, `Number.NaN`, no async work in service constructors: `AppUpdateService.start()` runs from an app initializer), and E2E no longer uses fixed `waitForTimeout` waits (`animationsDone()`, `toPass` retries).
- **Phase 17 (built 11 Nov 2026, not yet live):** Dividends page: India and US dividends (rupees credited, plus dollars for US), totals per financial year, the chosen year by stock and its entries. Not on Overview. Migration `0010_dividends.sql` must be applied to production before the push.
- **Phase 15 (live, 8 Nov 2026):** GitHub's scheduled runs started 3–7 hours late, so Cloudflare Cron Triggers (`web/worker/schedule.ts`) now start the NAV and price workflows on time, and the snapshot runs right after the morning NAV run (`workflow_run`). GitHub schedules stay as a fallback.
- **Open, owner only:** apply `0010_dividends.sql` to production, push, and add your dividends (Phase 17); in SonarQube Cloud, mark the remaining findings Accept or False positive (Issues page) and revoke the temporary read token; confirm the jobs now start on time (Phase 15); check each FD's maturity amount against its bank receipt and that tomorrow's snapshot shows an FD point in the history chart (Phase 16 acceptance); check the PPF per-year totals and balance against the passbook (Phase 13 acceptance); finish reconciling with the Google Sheet: Mutual funds, Stocks and Savings match (6 Nov 2026); RSU and Card dues still to check (Phases 3, 6, 10); check the PF balance and pension against the EPFO passbook (Phase 12 acceptance); rehearse a restore with a real backup (RUNBOOK › Rehearse a restore); test on a real phone; run app and sheet in parallel for 1 to 2 weeks, then retire the sheet.
- **Later, owner to define:** RSU + ESOP rules (see the end of this file). Backlog v2 (LIC, …) is not started; PF (Phase 12), PPF (Phase 13), NPS (Phase 14), FD (Phase 16) and Dividends (Phase 17) are built.
- **History worth knowing:** the GitHub repo was recreated on 5 Nov 2026 (the original stopped accepting pushes); secrets, Renovate and Cloudflare were reconnected. Hosting moved from Pages to Workers static assets. Sign-in emails go through custom SMTP (Gmail App Password) so the template can carry the code; the project sends 8-digit codes.

## Scope
**v1 (this plan):** Overview, Mutual Funds (per portfolio), Stocks (India, US), RSU, Savings, Credit Cards, Settings, auth, daily NAV/price jobs, daily snapshots (history chart), monthly credit card bills, backups, PWA.
**Backlog (v2, do not build now):** LIC, Term insurance, Loans, Realized profit, SIP tracker, XIRR (beyond NPS), Expenses, ESPP wallet.

## Assumptions (confirm with the owner if any is wrong)
- One login (the owner). No public sign-up. Several **portfolios** (for example Me and Wife) live under that one login; there are no per-portfolio logins.
- Amounts are INR unless the row is a US stock or RSU (USD, converted using a stored USD/INR rate).
- `MF`, `MF2`, `MF3` (and `Stocks`, `Stocks2`, `Stocks3`) are different people's portfolios, not duplicates. They become rows in the `portfolios` table. Default totals are the **family total (All portfolios)**, with a switcher for one portfolio. Confirm names and the Stocks mapping with the owner in Phase 3.
- No transaction ledger and no NAV/price history. Holdings are entered as units and invested amount; market data is latest-only (see `docs/DATA_MODEL.md`).
- Credit cards are managed monthly: one bill per card per month that can be marked paid.
- Free tiers only: Supabase Free, Cloudflare Workers Free, GitHub Actions Free.

---

## Phase 0: Prerequisites (Human)
- [x] **Human:** Create a GitHub repo (private) and push this folder as the first commit.
- [x] **Human:** Create a Supabase project (free). Note project URL, anon key, service role key.
- [x] **Human:** In Supabase Auth settings: disable "Allow new users to sign up". Enable email magic link (and optionally Google). Create the owner user manually (Auth > Users > Add user). Copy the user UUID.
- [x] **Human:** Create a Cloudflare account and a Worker connected to the GitHub repo (Pages at first; switched to Workers static assets, Cloudflare's recommended path, in Phase 9) (settings are filled in Phase 9).
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
- [x] Review `supabase/migrations/0001_init.sql`; adjust to `docs/DATA_MODEL.md` if they differ and keep both in sync.
- [x] **Human:** Apply the migration (Supabase SQL editor or `supabase db push` with the CLI).
- [x] Generate TypeScript types into `web/src/app/core/db.types.ts` and add an npm script `gen:types`.
- [x] Test the market-data upsert functions (`scripts/tests/test_upserts.py`): a newer date moves the old value into `prev_*`; the same date corrects the value without moving it; an older date is ignored; the anon and authenticated roles cannot execute the functions; a row with `is_manual = true` is not overwritten by `upsert_stock_price` or `upsert_fx_rate`.
- [x] Write an RLS test script (`scripts/tests/test_rls.py`): with the anon key and no login every table returns nothing or is rejected; with a second throwaway user (created in the test, deleted after) owner tables return zero rows of the owner's data.
- [x] Confirm views use `security_invoker = true` (verified by `test_rls.py`: a second user sees no rows through any view).

**Acceptance:** all tables have RLS enabled; RLS tests pass; an unauthenticated REST call returns no data.

## Phase 3: Data loading (done by the owner, no import tooling)
The owner loads their own data into Supabase. **Do not write an import script or read the Google Sheet.**
- [x] Write `docs/DATA_ENTRY.md` (already provided as a starting point; keep it accurate): table order, required columns, CSV headers for Supabase's table-editor CSV import, and SQL snippets for tables that reference other tables.
- [x] First-run experience in the app: when `portfolios` is empty show a welcome screen ("Create your first portfolio"); when a page has no holdings show an empty state with an Add button, so the app is fully usable even if the owner types everything in through the UI. (Welcome screen and the shared `EmptyState` with an action are done; each Phase 6 page uses `EmptyState` for its no-holdings case.)
- [x] Add a "Data check" section in Settings listing problems the owner can fix: funds with no `scheme_code`, funds whose `scheme_code` was not found in the latest AMFI file (the NAV job writes these into `job_runs.message`), stocks without a price, cards with no bill day or due day.
- [ ] **Human:** load the data (CSV import, SQL, or the app's forms) and compare totals with the Google Sheet. Mapping hints are in `docs/SHEET_MAPPING.md`.

**Acceptance:** the app works from an empty database; the Data check lists any holdings the jobs cannot price.

## Phase 4: Auth and app shell (responsive)
- [x] Supabase auth service (signal-based session), login page (email magic link; Google button if enabled), route guard for all pages, logout.
- [x] App shell: desktop >= 1024px = left sidebar; mobile = bottom tab bar (Overview, MF, Stocks, More) and a "More" sheet (RSU, Savings, Cards, Settings). Top bar with page title, refresh button, theme toggle, "last updated" time.
- [x] Global components: `MoneyPipe` (INR en-IN / USD), `PlColorDirective` (green positive, red negative, neutral zero), `StatCard`, `EmptyState`, `ErrorState`, skeleton loaders.
- [x] Portfolio switcher in the top bar (All, then one entry per active portfolio), persisted in `settings`; every page's data and totals respect it. Default is All.
- [x] Session persistence and auto-refresh of tokens; sign out when token is invalid.

**Acceptance:** unauthenticated users only see login; layout switches correctly at 767/768 and 1023/1024 px; no horizontal scroll at 360px.

## Phase 5: Core calculations (pure functions + tests)
- [x] `core/calc/mf.ts`, `stocks.ts`, `rsu.ts`, `savings.ts`, `cards.ts` implementing formulas in `docs/DATA_MODEL.md` ("Calculations" and "Credit card bills"), including portfolio-scoped totals (one portfolio or all active).
- [x] Unit tests with fixtures including: missing NAV, stale NAV date, zero units, negative P&L, USD conversion, RSU with partial vesting, card due-date computation (due day before and after bill day, short months), bill status (awaiting, unpaid, partial, paid, overdue), and totals across several portfolios.

**Acceptance:** all calculation tests pass; coverage of `core/calc` at least 90%.

## Phase 6: Feature pages
Build each page per `docs/UI_SPEC.md`. For every page: loading, empty and error states; desktop table + mobile card list; Playwright screenshots at 390x844 and 1440x900.
- [x] **Overview:** stat cards (MF value, MF today, Stocks value, Stocks today, RSU vested value, Savings, Card dues, Combined) for the selected portfolio or All, allocation donut chart, summary table with one row per portfolio plus a family total row, history line chart from `portfolio_snapshots`.
- [x] **Mutual Funds:** uses the portfolio switcher (All or one portfolio; in All mode show a portfolio column/tag), totals (current, invested, P&L and %, today), search, sort, column totals footer, NAV date shown with a stale-NAV badge, add/edit/delete holding dialog (portfolio, scheme code, units, invested, folio; the scheme code field explains where to find the AMFI code, and a fund-name search is optional: only add it if a free source such as mfapi.in is allowed in the CSP, and ask the owner first), CSV export.
- [x] **Stocks:** India and US tabs, same totals, quantity/avg price edit, USD to INR display toggle.
- [x] **RSU:** grants table, cards for total value (after tax INR), USD pre/after tax, vested value INR, current price, units (total, vested, sellable, pending, sold for tax). Edit grants.
- [x] **Savings:** accounts list with balance share bar, inline balance edit, add/delete account, total.
- [x] **Cards (monthly management):** month selector (default current month), bills for that month with status chips (awaiting, unpaid, partial, paid, overdue), a section for unpaid bills from earlier months, "Create this month's bills" (rows with no amount for every active card), enter or edit a bill amount, **Mark paid** (full) and record a partial payment, notes, manage cards (add, edit bill/due day, deactivate). Summary cards: total pending, bills awaiting a statement, next due (red if within 3 days or overdue). Rules in `docs/DATA_MODEL.md`.
- [x] **Settings:** ~~manage portfolios (add, rename, reorder, deactivate; delete only with a strong confirmation)~~ (done in Phase 3), theme, manual price override (stock or FX), last job runs, data export (JSON), sign out.

**Acceptance:** each page matches `UI_SPEC.md`; totals equal the Google Sheet's within rounding for the same date's NAVs; all pages pass the responsive checks.
- [ ] **Human:** compare the app's totals with the Google Sheet for the same date's NAVs (needs your data loaded and, for live NAVs, the Phase 7 jobs).

Notes: the allocation is a segmented bar instead of a donut, and the Overview uses 3 stat columns on desktop (see `UI_SPEC.md`). The optional fund-name search (mfapi.in) was not added; the scheme code field explains where to find the code.

## Phase 7: Scheduled jobs
Put code in `scripts/jobs/`, workflows in `.github/workflows/`. All jobs use the service role key from GitHub Secrets and are idempotent.
- [x] `fetch_nav.py` + `nav.yml`: download AMFI `NAVAll.txt` (now https://portal.amfiindia.com/spages/NAVAll.txt), parse (`;` separated: scheme code; ISIN payout; ISIN reinvest; scheme name; NAV; date), for only the scheme codes present in `mf_holdings`, call the SQL function `upsert_mf_nav(code, nav, date)` via Supabase RPC (service role). Never store NAV history; the function keeps the latest and previous value only. Schedule (since 7 Nov 2026, cron in IST via `timezone: Asia/Kolkata`): daily at 23:37 IST and a retry at 08:17 IST, before the 08:37 snapshot. Handle holidays (no new date = no new rows, not an error).
- [x] `fetch_prices.py` + `prices.yml`: stock prices behind a `PriceProvider` interface. Default provider: choose the most reliable free source at implementation time (for example NSE/BSE bhavcopy for India, and a free quote source for US); document the choice and add a fallback. Write results with `upsert_stock_price(...)` and fetch USD/INR with `upsert_fx_rate(...)`; skip symbols whose row has `is_manual = true`. Schedule: weekdays after Indian market close and after US close.
- [x] `snapshot.py`: compute and upsert one row per portfolio per day into `portfolio_snapshots` (uses the same formulas as the frontend; share logic via SQL view or duplicate with tests that compare).
- [x] `backup.py` + `backup.yml`: weekly export of all owner tables to JSON, encrypt with `age` using `BACKUP_AGE_RECIPIENT`, commit to a separate PRIVATE backup repo (or upload as a workflow artifact with 90-day retention if the owner prefers).
- [x] Keep-alive: the daily NAV job already counts as activity, but also run a trivial query weekly so the free project is never paused.
- [x] Failure notification: workflow failure emails the owner (GitHub default) and also write a `job_runs` row (name, status, message, time). Show last-run status in Settings.

**Acceptance:** manual `workflow_dispatch` of each job succeeds; re-running creates no duplicates; NAV date shown in the MF page advances.
- [x] **Human:** add the GitHub secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_AGE_RECIPIENT` (make the key with `age-keygen`, keep the private half offline; see `docs/RUNBOOK.md`), push, then run each workflow once from the Actions tab and check Settings › Job runs.

Notes: sources are NSE bhavcopy (India), Yahoo Finance (US, and India fallback; Stooq now blocks scripts), Frankfurter (USD/INR), AMFI (NAVs); see `docs/ARCHITECTURE.md`. Backups go to a 90-day workflow artifact (owner's choice). Only held codes and symbols are fetched and stored.

## Phase 8: PWA, accessibility, performance
- [x] PWA: manifest, icons, service worker (cache app shell only, never cache API responses containing financial data), installable on iOS and Android. Sign-in also accepts the code from the email, because the iPhone home-screen app cannot use a link that opens in Safari.
- [x] **Human:** paste `supabase/templates/magic_link.html` into Supabase › Authentication › Emails › Magic link (see docs/RUNBOOK.md), then install the app on your phone and sign in with the code. Editing templates needed custom SMTP (Gmail App Password); the project sends 8-digit codes.
- [x] Accessibility: keyboard navigation, focus states, labels on icon buttons, contrast AA in both themes, color is never the only signal for gain/loss (also show +/- sign). `e2e/accessibility.spec.ts` runs axe-core (WCAG 2.1 A/AA) on every page and an edit dialog, light and dark, phone and desktop, and checks dialogs open and close from the keyboard with focus returned.
- [x] Performance: lazy-load feature routes, initial JS under ~300 KB gzip, Lighthouse mobile performance >= 90. Done: feature routes lazy, initial JS 176 KB gzip (from 199), Lighthouse mobile 89–91 on the local production build (accessibility 100, best practices 100).
- [x] **Human:** run https://pagespeed.web.dev on the live `/login` URL (mobile) to confirm >= 90 on Cloudflare's edge. Result 5 Nov 2026: performance 99–100 (FCP/LCP 0.8 s), accessibility 100, best practices 100. SEO 54 is intentional: the site is `noindex` (meta tag, `X-Robots-Tag`, `robots.txt`) so search engines never list it.
- [x] Privacy mode: a "hide amounts" toggle (masks all money values with ••••) persisted locally, useful in public.

## Phase 9: Deploy
- [x] Workers static assets config (`web/wrangler.jsonc`: output folder, single-page-application fallback). Cloudflare now recommends Workers over Pages for new projects.
- [x] **Human:** create the Worker from the GitHub repo: root `web`, build `npm ci && npm run build`, deploy `npx wrangler deploy`, `NG_APP_*` as build variables (Node version comes from `web/.node-version`).
- [x] SPA fallback and security headers per `docs/SECURITY.md`. `npm run build` writes `_headers` (CSP with the Supabase origin from `NG_APP_SUPABASE_URL`, HSTS, nosniff, Referrer-Policy, frame-ancestors none). No `_redirects`: unknown paths get `index.html` through `not_found_handling: single-page-application`. Critical-CSS inlining is off because its inline script would be blocked by the CSP.
- [x] **Human:** add GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_AGE_RECIPIENT` (all set 5 Nov 2026; a backup was downloaded and decrypted). `OWNER_USER_ID` turned out not to be needed. The repo was recreated on 5 Nov 2026 after GitHub stopped accepting ref updates on the original; the secrets were re-added there.
- [ ] Optionally restrict access further with Cloudflare Access (free for up to 50 users) in front of the site.
- [x] Supabase Auth: set Site URL and redirect URLs to the deployed domain.

**Acceptance:** production site loads over HTTPS, login works from phone and desktop, jobs run on schedule.

## Phase 10: QA and cutover
- [x] Full Playwright suite on Chromium plus WebKit mobile emulation (`iphone` project: WebKit as an iPhone 15; 76 tests pass across mobile, desktop and iPhone).
- [ ] **Human:** manual test on a real phone (install to the home screen, sign in with the code, add and edit a holding, toggle hide amounts and dark mode).
- [ ] Reconcile: compare Overview totals with the Google Sheet for the same day. MF, Stocks and Savings match (6 Nov 2026); RSU and Card dues still to check.
- [ ] Security checklist in `docs/SECURITY.md` fully ticked.
- [x] Write `docs/RUNBOOK.md`: how to restore from backup, rotate keys, add a new fund, fix a failed job. Restore is `scripts/tools/restore.py` (plan, typed confirmation, rollback on failure, `--replace`, `--owner-email` for a new project), tested in `scripts/tests/test_restore.py`.
- [ ] **Human:** rehearse a restore once: a real backup into the local database (docs/RUNBOOK.md › Rehearse a restore).
- [ ] **Human:** run both systems in parallel for 1 to 2 weeks, then retire the sheet (keep it read-only as an archive).

**Acceptance:** totals reconcile; owner signs off.

## Phase 11: Run jobs from the website
- [x] Migration `0002_job_triggers.sql`: `job_triggers` (one row per job) with `claim_job_trigger` (atomic 30-minute lock) and `release_job_trigger`; RLS read-only for `authenticated`, nothing for anon. Tested in `scripts/tests/test_job_triggers.py` and `test_rls.py`.
- [x] Cloudflare Worker `web/worker/` for `POST /api/jobs/:job` (`fetch_nav` → `nav.yml`, `fetch_prices` → `prices.yml`): checks the sign-in and takes the lock through Supabase with the caller's token, dispatches the GitHub workflow, releases the lock if GitHub refuses. Only `/api/*` runs the Worker. Tests: `npm run test:worker`.
- [x] Settings › Job runs: Run now on NAVs and prices, "Available again at …", result or reason under the row, Job runs re-checked after two minutes. Playwright at all three viewports with `/api` stubbed.
- [x] **Human:** create the fine-grained GitHub token and the four Worker variables (docs/RUNBOOK.md › Set up Run now).
- [x] Security Advisor follow-up (`0003_tighten_shared_tables.sql`): `rls_auto_enable()` no longer callable by anon or authenticated; `job_runs` and `mf_nav_latest` read-only for signed-in users.
- [x] **Human:** apply `0002_job_triggers.sql` and `0003_tighten_shared_tables.sql` to production before pushing, then push and press Run now once.

**Acceptance:** Run now starts the workflow and shows its result in Job runs; a second press within 30 minutes is refused with the time it frees up; no GitHub or service key in the bundle.

## Phase 12: Provident fund (PF)
The owner asked for PF tracked like the sheet's PF tab: one row per company, wage month and contribution type (monthly or interest) with employee, employer and pension amounts. This is the app's one ledger (AGENTS.md rule 5 exception).
- [x] Migration `0004_pf.sql`: `pf_entries` (owner RLS; interest only in March with pension 0; unique per company, month and type) and `portfolio_snapshots.pf_balance`. Tested in `test_pf.py`, `test_rls.py`, backup/restore round trip; a test keeps the backup and app-export table lists identical.
- [x] Calculations `core/calc/pf.ts` (balance = employee + employer + interest, pension apart, financial years, next-month draft) with Python parity in `lib/calc.py` and the shared fixture; the snapshot job writes `pf_balance`.
- [x] PF page: stat cards, by company with Add next month, passbook table/cards filtered by company and financial year, add/edit/delete dialog (monthly or interest). Nav item PF; More sheet in three columns. E2E at all three viewports; axe in both themes including the dialog.
- [x] Overview: PF card (cards 4 across on desktop), PF in the allocation bar (fifth series colour), history switch MF + stocks / PF.
- [x] **Human:** apply `0004_pf.sql` to production (SQL editor), then push.
- [x] `0005_pf_month_uniqueness.sql`: wage month may be any day; one monthly row and one interest row per portfolio, company and calendar month.
- [x] **Human:** apply `0005_pf_month_uniqueness.sql` to production (SQL editor), then push.
- [x] `0006_pf_wage_month_and_transaction_date.sql`: wage month as Jan…Dec plus wage year, a transaction date on every row, interest without a wage month and unique per financial year of its date. **Deletes existing PF rows** (the owner reloads them in the new CSV format).
- [x] **Human:** apply `0006` to production (after `0005`), push, then reload PF data (docs/DATA_ENTRY.md, new CSV headers). Done 7 Nov 2026.
- [x] **Human:** load past PF months (Add next month in the app, or CSV/SQL per docs/DATA_ENTRY.md). Loaded 7 Nov 2026.
- [x] Every date field uses the PrimeNG DatePicker (`shared/ui/date-input.ts`, "7 Nov 2026", stored as `YYYY-MM-DD`); E2E picks dates with `pickDate()`; axe audits the open calendar.

**Acceptance:** the PF balance and pension match the passbook; adding a month is one tap on Add next month and Save; the next morning's snapshot shows a PF point in the history chart.

## Phase 13: Public Provident Fund (PPF)
The owner asked for PPF as dated rows (investment or interest) with investment and interest shown per financial year. Each row also has an account name, so one portfolio can hold several PPF accounts. A ledger by the owner's choice (AGENTS.md rule 5 exception).
- [x] Migration `0007_ppf.sql`: `ppf_entries` (owner RLS; amount > 0; one interest row per account and financial year) and `portfolio_snapshots.ppf_balance`. Tested in `test_ppf.py`, `test_rls.py`, `test_jobs.py` (snapshot) and the backup/restore round trip; backup and app export include it.
- [x] Calculations `core/calc/ppf.ts` (balance, per account, per financial year with closing balance, room left, over-limit and below-minimum flags; `fyStart`/`fyLabel` moved to `common.ts`) with Python parity in `lib/calc.py` and the shared fixture; the snapshot job writes `ppf_balance`.
- [x] PPF page: stat cards (balance, invested, interest, this year's deposits with room left), By financial year table/cards filtered by account, By account with Add investment, entries filtered by year, add/edit/delete dialog. Nav item PPF. E2E at all three viewports; axe in both themes including the dialog. Local seed adds a sample PPF passbook.
- [x] Overview: PPF card (stat grid five across from 1280px), PPF in the allocation bar (sixth series colour, slate), history switch MF + stocks / PF / PPF.
- [x] **Human:** apply `0007_ppf.sql` to production (SQL editor), then push. Done 7 Nov 2026.
- [x] **Human:** load PPF data (Add investment / Add interest in the app, or CSV/SQL per docs/DATA_ENTRY.md). Loaded 7 Nov 2026 (CSV import).

**Acceptance:** per-year investment and interest match the PPF passbook; the balance matches the latest passbook balance; the next morning's snapshot shows a PPF point in the history chart.

## Phase 14: National Pension System (NPS)
The owner asked for NPS as two tables: the account's current state (units per scheme) and its contributions (date, self or employer, amount), with a table per financial year and an XIRR. Schemes are rows, not columns: each has its own NPS code and NAV. Tier I only for now (a tier column would be a new migration). Contributions are a ledger by the owner's choice (AGENTS.md rule 5 exception); NAVs stay latest-only.
- [x] Migration `0008_nps.sql`: `nps_holdings` (one row per portfolio, account and scheme class E/C/G/A; units, scheme code, units as of), `nps_contributions` (self or employer, amount > 0), both with owner RLS; latest-only `nps_nav_latest` with `is_manual` and `upsert_nps_nav` (service role only); `portfolio_snapshots.nps_value`. Tested in `test_nps.py`, `test_rls.py`, `test_upserts.py`, `test_jobs.py` (snapshot) and the backup/restore round trip; backup and app export include both tables.
- [x] Job `fetch_nps_nav`: NPS Trust's latest-NAV export, falling back to Protean CRA's dated daily file; only held codes; a second, independent job in `nav.yml`, so the schedule and Run now cover it. Parsers tested on samples of both real formats.
- [x] Calculations `core/calc/xirr.ts` (Actual/365, Newton with a bisection fallback; checked against Excel's XIRR example) and `core/calc/nps.ts` (value, invested split, P&L, day change, XIRR per account and overall, scheme mix, per financial year, units-behind flag), with Python parity for `nps_value` through the shared fixture.
- [x] NPS page: stat cards (value, invested, P&L, XIRR, this year's contributions), By account (scheme mix bar, Update units, Add scheme, Add contribution), Schemes table/cards, By financial year filtered by account, Contributions filtered by contributor and year, with add/edit/delete dialogs. Data check flags NPS schemes without a usable code. Nav item NPS. E2E at all three viewports; axe in both themes including the dialogs. Local seed adds a sample NPS account.
- [x] Overview: NPS card with today's change (stat grid keeps full rows with eight cards), NPS in the allocation bar (seventh series colour, magenta), history switch adds NPS.
- [x] Fixes found on the way: allocation-bar labels now meet 4.5:1 on every series colour; the link in the Overview "no price yet" note is underlined.
- [x] **Human:** apply `0008_nps.sql` to production (SQL editor), then push. Done 8 Nov 2026.
- [x] **Human:** load NPS data: each scheme with its units and scheme code (Add scheme, or CSV/SQL per docs/DATA_ENTRY.md), then contributions. After each statement, Update units. Loaded 8 Nov 2026.

**Acceptance (met 8 Nov 2026, checked by the owner):** units × NAV matches the latest NPS statement value (within a day's NAV move); per-year self and employer totals match the transaction statement; the XIRR is in line with the statement's or a spreadsheet XIRR on the same flows; the next morning's snapshot shows an NPS point in the history chart.

## Phase 15: Jobs on time
GitHub's `schedule` runs started 3 to 7 hours late on every workflow (5–7 Nov 2026), and some were dropped; the snapshot could run before the morning NAVs.
- [x] Cloudflare Cron Triggers (UTC, `wrangler.jsonc` `triggers.crons`; 4 of the 5 free) dispatch `nav.yml` at 23:37 and 08:17 IST and `prices.yml` at 19:13 IST Mon–Fri and 04:23 IST Tue–Sat, through the Worker's GitHub token (`web/worker/schedule.ts`, shared dispatch with Run now; no Run now lock). Tests keep the code and `wrangler.jsonc` in step and check the IST times.
- [x] `snapshot.yml` runs when a NAV run completes, gated to 06:00–11:59 IST; the 08:37 IST schedule stays as a fallback. Backup and keepalive keep their GitHub schedules.
- [x] Docs: ARCHITECTURE (Jobs, on-time starts), RUNBOOK (jobs start late), AGENTS.md gotcha.
- [ ] **Human:** after a day live, check that Cloudflare › Workers › portfolio-tracker › Settings lists the four Cron Triggers, that Workers Logs show `schedule: started …`, and that Actions shows NAV at about 08:17 IST (event `workflow_dispatch`) followed by Snapshot (event `workflow_run`).

**Acceptance:** NAV, price and snapshot runs start within a few minutes of their times for a week; the day's snapshot is written after that morning's NAVs.

## Phase 16: Fixed deposits (FD)
The owner asked for an FD page: bank, date of investment, principal and rate, with each FD's maturity amount and days left as a progress bar. The owner chose a maturity date (not a tenure), per-FD compounding defaulting to quarterly (payout for interest paid out), and full Overview and history integration.
- [x] Migration `0009_fixed_deposits.sql`: `fixed_deposits` (owner RLS; principal and rate above 0, rate below 100, maturity after start, compounding check) and `portfolio_snapshots.fd_value`. Tested in `test_fd.py`, `test_rls.py`, `test_jobs.py` (snapshot) and the backup/restore round trip; backup and app export include it.
- [x] Calculations `core/calc/fd.ts` (maturity amount, value today, days left, progress, matured and maturing-soon flags, totals) with Python parity in `lib/calc.py` (`snapshot_values` now takes the day) and the shared fixture; the snapshot job writes `fd_value`.
- [x] FD page: stat cards (value today, principal, at maturity, next maturity), matured note, Active and Matured card grids with maturity amount, days left and a term progress bar, add/edit/delete dialog with a live maturity preview. Nav item Fixed deposits. E2E at all three viewports; axe in both themes including the edit dialog. Local seed adds sample FDs.
- [x] Overview: FD card (stat grid now three rows of four from 1024px), FD in the allocation bar (eighth series colour, brown), history switch includes FD.
- [x] The shared edit dialog's red Delete text button now meets 4.5:1 in light mode (first audited here).
- [x] **Human:** apply `0009_fixed_deposits.sql` to production (SQL editor), then push. Done 8 Nov 2026.
- [x] **Human:** add your FDs (Fixed deposits › Add FD, or CSV/SQL per docs/DATA_ENTRY.md). Added 8 Nov 2026.

**Acceptance:** each FD's maturity amount matches the bank's receipt within a few rupees; days left count down daily; the next morning's snapshot shows an FD point in the history chart.

## Phase 17: Dividends
The owner asked for a separate page to record dividends received (market, symbol, date, amount) and see them per financial year, with no change to the home page. The owner chose: US rows keep both the rupees credited and the dollars paid (the rate changes); a per-year table with a per-stock view of the chosen year; symbols typed freely with suggestions from stock holdings.
- [x] Migration `0010_dividends.sql`: `dividends` (owner RLS; market IN/US, upper-case symbol up to 20 characters, `amount_inr` above 0, `amount_usd` above 0 and required exactly for US). Tested in `test_dividends.py`, `test_rls.py` and the backup/restore round trip; backup and app export include it.
- [x] Calculations `core/calc/dividends.ts` (per financial year with India/US split, per stock for a year, this FY / last FY / all time) with unit tests. App only: no snapshot column, no Python parity needed.
- [x] Dividends page: stat cards, By financial year (the year picks the view below), the chosen year by stock and its entries, add/edit/delete dialog (₹ hint at today's rate for US). Nav item Dividends (More sheet on phones). E2E at all three viewports; axe in both themes including the US dialog. Local seed adds sample dividends.
- [ ] **Human:** apply `0010_dividends.sql` to production (SQL editor), then push.
- [ ] **Human:** add your dividends (Dividends › Add dividend, or SQL/CSV per docs/DATA_ENTRY.md).

**Acceptance:** each financial year's total matches the dividends credited in the bank and broker statements for that year; US rows show the dollars paid next to the rupees credited; Overview is unchanged.

## Later (owner to define)
- [ ] **RSU + ESOP:** revisit the RSU after-tax formula (currently `units_granted * price * (1 - tax_rate)`, kept as is for now) and add ESOP handling. Needs a schema change (new migration) and the owner's rules before any work starts.

---

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Free stock price sources are unofficial or break | `PriceProvider` interface, fallback provider, manual price override column, job-failure notification |
| Fund name to AMFI code mismatch | Strict matching, `unmatched.csv`, owner confirms |
| Supabase free project pausing | Daily jobs + weekly keep-alive |
| Data loss | Weekly encrypted backup, `docs/RUNBOOK.md` restore steps |
| Financial data in a public site | RLS on every table, sign-up disabled, optional Cloudflare Access, no data caching in service worker |
