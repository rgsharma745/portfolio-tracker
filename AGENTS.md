# AGENTS.md

Instructions for AI coding agents (Claude Code) working on this repo. Read this fully before making changes. Also read `PLAN.md` and the files in `docs/`.

## Project summary
Personal portfolio tracker for ONE login (the owner), with several portfolios under it (for example the owner and the owner's wife; portfolios are labels, not accounts). It tracks Indian mutual funds, stocks (India and US), RSUs, savings balances and credit card dues. Data lives in Supabase Postgres. The site is a static Angular app on Cloudflare Workers (static assets only). Scheduled GitHub Actions load daily NAVs and prices. It replaces an existing Google Sheet and must reach feature parity with it (see `docs/SHEET_MAPPING.md`).

## Tech stack (do not swap without asking)
- Angular (latest stable), standalone components, signals, TypeScript strict mode
- PrimeNG (Aura theme, light and dark) for UI components; Tailwind CSS only for layout utilities. PrimeNG is under the PrimeUI license (not MIT): the owner uses a free Community License key, supplied as `NG_APP_PRIMEUI_LICENSE` and renewed yearly
- Supabase: Postgres, Auth, Row Level Security. Client: Supabase's `@supabase/auth-js` + `@supabase/postgrest-js` (the parts of `supabase-js` the app uses; see `core/data/supabase.client.ts`)
- Charts: Chart.js used directly through the shared `app-line-chart` component (not PrimeNG Chart, which is deprecated in favor of paid PrimeUI PRO Charts)
- Jobs and scripts: Python 3.15 (`scripts/`), run by GitHub Actions
- Hosting: Cloudflare Workers with static assets (`web/wrangler.jsonc`; static build, no SSR). The only Worker code is `web/worker/`, which handles `/api/*` (today just `POST /api/jobs/:job`, "Run now" in Settings); every other path is served straight from the assets. Keep it that small: no data API, RLS stays the authorization layer
- Tests: Vitest or Jasmine for unit tests, Playwright for end-to-end, pytest for scripts

### PrimeNG licensing guards
- Do not use PrimeNG components that are deprecated in favor of PrimeUI PRO (paid), currently Chart and Editor. Check the component's `@deprecated` notes before adopting it.
- Feature pages use the shared `DataTable` wrapper (`web/src/app/shared/`), never PrimeNG `Table` directly, so the table can be replaced in one place if it ever moves to PRO. Simple primitives (buttons, inputs, tags) may be used directly.
- Stay on the current PrimeNG major. Before upgrading to a new major, read its release notes for components moving to PRO. Dependency bots must not auto-merge PrimeNG majors. Renovate (`renovate.json`) enforces this: PrimeNG majors, and all majors, wait for approval on its Dependency Dashboard issue.

Use the latest stable versions and check the official docs for the installed version before using an API. Do not rely on memory for PrimeNG or Angular APIs that change between majors.

## Repo layout
```
/                     config, README, AGENTS.md, PLAN.md
docs/                 design docs (source of truth for behaviour)
supabase/migrations/  SQL migrations (numbered, never edited after merge)
web/                  Angular app
scripts/              Python: NAV/price jobs, snapshot, backup
.github/workflows/    scheduled jobs and CI
```

## Commands (fill in as they are created, keep this list current)
- Install: `cd web && npm ci` (first time for E2E: `npx playwright install chromium webkit`)
- Dev server: `cd web && npm start` (http://localhost:4200)
- Dev server on the local database: `cd web && npm run db:start` (starts the local Supabase stack in Docker and ensures the user `test@portfolio-tracker.com` with sample portfolios), then `npm run start:local` (http://localhost:4300) and sign in as that user. Stop the stack with `npm run db:stop` (data is kept). `npm run local:user -- other@example.com [--seed]` adds more local users. Magic-link emails land in Mailpit at http://127.0.0.1:54324. Uses `env.local.ts` and the `local` build configuration, so it can run next to `npm start`. With `--seed` (as `db:start` does) the user also gets sample holdings, cards, bills, prices and 200 days of history, added only if that user has none.
- Unit tests: `cd web && npm test` (Vitest, single run, then the Worker's tests via `npm run test:worker`; `npm run test:watch` to watch the app's). `npm run test:coverage` also fails if `core/calc` coverage drops below 90% (CI runs this one; HTML report in `web/coverage/`). `npm run test:sonar` writes lcov for all of `src/app` for SonarQube (CI only runs it when `SONAR_TOKEN` is set)
- E2E: `cd web && npm run e2e` (`E2E_COVERAGE=1` also records Chromium code coverage into `web/coverage/e2e/lcov.info` for SonarQube; CI sets it; Playwright: Chrome at 390x844 and 1440x900, and WebKit as an iPhone 15; `npx playwright test --project=iphone` runs only the iPhone pass). Requires the local database (below). It serves the app with `npm run start:local` (port 4300, `local` build configuration, separate `env.local.ts`), so it never touches a dev server on 4200 or production. Sign-in uses a real magic link read from the local Mailpit. Runs in parallel (half the CPU cores; about 2 minutes on 12 cores); while iterating, `--project=desktop` or a single spec file is faster still.
- E2E TypeScript check: `cd web && ./node_modules/.bin/tsc --noEmit -p tsconfig.e2e.json`. This project includes `e2e/` and `playwright.config.ts` with Node types, separate from the browser app's TypeScript config.
- App icons: `cd web && node scripts/make-icons.mjs` re-renders `public/icons/` (PNGs are committed)
- Lint and format check: `cd web && npm run lint` (ESLint + Prettier check); fix formatting with `npm run format`
- Build: `cd web && npm run build` (output `web/dist/portfolio-tracker/browser`; `postbuild` writes Cloudflare's `_headers` with the CSP). Cloudflare Workers Builds builds it from `web/` with `npm ci && npm run build` (Node from `web/.node-version`) and deploys with `npx wrangler deploy` (`web/wrangler.jsonc`). Preview the production build locally with `npx wrangler dev` in `web/`
- Worker locally: copy `web/.dev.vars.example` to `web/.dev.vars` (git-ignored; Supabase values from `npx supabase status`, a test GitHub token), `npm run build`, then `npx wrangler dev` in `web/` (port 8787). `npm start` and `npm run start:local` proxy `/api` there (`web/proxy.conf.json`). E2E stubs `/api` instead.
- Secret scan of the build: `cd web && node scripts/check-bundle-secrets.mjs dist` (CI runs it after the build; fails on an `sb_secret_` key or a service-role JWT)
- Environment: `web/scripts/set-env.mjs` runs before start/build/test/lint and writes the git-ignored `web/src/environments/env.ts` from `NG_APP_SUPABASE_URL`, `NG_APP_SUPABASE_ANON_KEY` and `NG_APP_PRIMEUI_LICENSE`. It reads the process environment first, then `web/.env`, then the repo-root `.env`. It refuses a service-role/secret key and fails on a Cloudflare build (`WORKERS_CI` or `CF_PAGES`) if the Supabase variables are missing.
- Local database: `cd web && npm run db:start` / `npm run db:stop` (Docker required). After a migration change, or to wipe local data, run `npm run db:reset` (local only: re-applies `supabase/migrations/` and recreates the test user).
- Generate DB types: `cd web && npm run gen:types` (from the local database; CI fails if `db.types.ts` is out of date)
- Scripts setup: `cd scripts && python3.15 -m venv .venv && .venv/bin/pip install --require-hashes --only-binary=:all: -r requirements-dev.txt`
- Python dependency inputs live in `scripts/requirements.in` and `scripts/requirements-dev.in`; Renovate updates them and regenerates their hash-locked `.txt` files with `uv pip compile`. To regenerate locally, run `uv pip compile --python-version=3.15 --universal --only-binary=:all: --generate-hashes --output-file=scripts/requirements.txt scripts/requirements.in` and `uv pip compile --python-version=3.15 --universal --only-binary=:all: --generate-hashes --output-file=scripts/requirements-dev.txt scripts/requirements-dev.in`.
- Scripts tests: `cd scripts && .venv/bin/pytest` (add `--cov --cov-report=xml` for coverage, as CI does for SonarQube; targets the local database; set `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` to target another project). The backup round-trip test runs only where `age` is installed (CI installs it).
- Restore a backup: `cd scripts && .venv/bin/python -m tools.restore <backup.json.age> --identity <key.txt> [--replace | --owner-email you@example.com]` (shows a plan, asks to type RESTORE; steps in docs/RUNBOOK.md › Restore a backup)
- Import mutual-fund transactions: `cd scripts && .venv/bin/python -m tools.import_cas <original-cams-detailed.pdf> [--portfolio PORTFOLIO_NAME] [--apply]` (one portfolio per PDF; zero-unit fund positions are skipped, and empty folios omitted; local PDF parsing; preview by default; `--apply` requires typing `IMPORT`; see docs/DATA_ENTRY.md)
- Run a job: `cd scripts && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... .venv/bin/python -m jobs.fetch_nav` (also `fetch_nps_nav`, `fetch_prices`, `snapshot`, `backup`, `keepalive`). Against the local stack, take both values from `npx supabase status` (API URL and service role key). Against production from your machine: `cd scripts && .venv/bin/python -m tools.run_prod <job>` (reads the git-ignored `scripts/.env.prod`, from `.env.prod.example`; asks before running). In GitHub: Actions › the job's workflow › Run workflow. Jobs fetch only the codes and symbols present in the database and identify themselves honestly (never as a browser).

## Hard rules
1. **Security first.** Every table has Row Level Security enabled and an owner policy. Never disable RLS, never add a policy that allows anonymous access. See `docs/SECURITY.md`.
2. **Secrets.** The Supabase service role key is only used in `scripts/` and GitHub Actions. It must never appear in `web/`, in logs, or in git. Never commit `.env`.
3. **Money.** Use Postgres `numeric` for money and units, never floats. In TypeScript keep values as numbers only for display math and round only at the display layer. Format INR with the `en-IN` locale (lakh/crore grouping, e.g. ₹56,74,412). Format USD with `en-US`.
4. **Migrations.** Schema changes only through a new numbered file in `supabase/migrations/`. Never edit a migration that has already been applied.
5. **Keep it light.** No NAV or price history tables: market data is latest-only (see `docs/DATA_MODEL.md`). The owner has requested ledgers for `mf_transactions` (CAMS CAS transaction rows), `pf_entries` (PF passbook), `ppf_entries` (PPF passbook), `nps_contributions` (NPS contributions), and `dividends` (dividends received). No other ledgers without asking.
5a. **Portfolios.** Every holding, savings account, card and RSU grant belongs to a `portfolio_id`. Totals default to all active portfolios; the portfolio switcher scopes every page.
5b. **Credit cards are monthly.** Bills are one row per card per month (`card_bills`) with a derived status; never store status or a single "pending amount" on the card.
5c. **No invented data.** Never hardcode sample portfolio values in production code. Use fixtures only in tests.
6. **One login.** Public sign-up is disabled. Do not build registration, per-portfolio logins or sharing features.
7. **No Google Sheet import tooling.** The owner loads their own sheet data (see `docs/DATA_ENTRY.md`). Do not write scripts that read the Google Sheet. The owner-requested CAMS CAS CLI is a separate, local-only import and must never read the sheet.
8. **Ask before** adding a new paid service, a new major dependency, or anything that is not free-tier.

## Responsive requirement (applies to every page)
- Mobile first. Must be usable at 360px width and on desktop at 1440px.
- Breakpoints: mobile < 768px, tablet 768 to 1023px, desktop >= 1024px.
- Mobile: bottom navigation bar, cards instead of wide tables for holdings lists, touch targets at least 44px, dialogs become full-screen sheets.
- Desktop: left sidebar navigation, full data tables with sorting, filtering and totals.
- No horizontal page scroll on any viewport. Wide tables scroll inside their own container; long tables too, capped at the viewport height with the header row (and the totals row) pinned.
- Respect `prefers-color-scheme`; support a manual light/dark toggle. Respect iOS safe-area insets.
- Every new page needs a Playwright check at 390x844 and 1440x900, and an entry in `e2e/accessibility.spec.ts` (axe-core, WCAG 2.1 AA, both themes).
See `docs/UI_SPEC.md`.

## Code conventions
- Standalone components, `ChangeDetectionStrategy.OnPush`, signals for state, `inject()` for DI.
- One feature per folder under `web/src/app/features/<name>/` (page component, service, models, tests).
- Shared UI under `web/src/app/shared/` (`ui/` components and pipes, `layout/` shell and navigation, `format/` pure formatters). Supabase access only through services in `web/src/app/core/data/` (and `core/auth/` for sessions), never directly in components; ESLint enforces this.
- In component/page unit tests, provide mocks or fakes for injected data/auth services in `TestBed`. Do not instantiate real services that connect to Supabase or other external systems unless the test explicitly configures those dependencies.
- Calculation logic (value, P&L, day change, XIRR if added) lives in pure functions in `web/src/app/core/calc/` with unit tests.
- Types for database rows are generated with `supabase gen types typescript` into `web/src/app/core/db.types.ts`. Do not hand-write them.
- Small, readable functions; no `any`; handle loading, empty and error states on every page.
- Python scripts: typed, `requests` with timeouts and retries, idempotent (safe to re-run), exit non-zero on failure, never print secrets.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). One logical change per commit.

## Workflow
0. New session: read the **Status** section at the top of `PLAN.md` first; it says what is built, what is open and what is the owner's. Update it when work lands.
1. Work through `PLAN.md` phase by phase. Tick the checkbox when a task is done and meets its acceptance criteria.
2. Before finishing a phase: run lint, unit tests, build, and (if UI changed) Playwright. Report results.
3. Stop at the end of each phase and summarise what was done and what the human must do next.
4. If something in the docs is unclear or conflicts with reality (for example, a sheet column differs from `SHEET_MAPPING.md`), stop and ask rather than guess.
5. Keep `docs/` updated when behaviour changes.

6. Git: commit locally, one logical change per commit; never push (the owner pushes, and a push deploys the site). End commit messages with the `Co-Authored-By` line the session gives you.

## Gotchas (learned the hard way)
- **E2E hangs before any test starts:** a leftover `ng serve --configuration local --port 4300` from an earlier run accepts connections but never answers, and Playwright reuses it. Kill it (`lsof -iTCP:4300 -sTCP:LISTEN`) and rerun.
- **Magic-link sign-in refused in tests:** Supabase sends one email per address per second; the e2e helper retries with `toPass` (1.5 s apart). Local `otp_length` is 8 to match production; the app accepts 6 to 10 digits.
- **Never point the whole pytest suite at production:** the job tests write market data. Only `tests/test_rls.py` is safe there (it uses throwaway users).
- **Production has no `supabase-js`:** use `core/data/supabase.client.ts` (`auth`, `from`). Realtime and storage are not available; the CSP has no `wss://`.
- **A PrimeNG component not listed in `core/theme/preset.ts` renders unstyled:** add its Aura tokens there when you start using it.
- **Run now must never reach GitHub from tests:** E2E stubs `/api/jobs/*` with `page.route`; read headers there with `allHeaders()` (WebKit leaves `Authorization` out of `headers()`). The Worker's `GITHUB_TOKEN` is a Cloudflare secret only, never in `web/src`, `.env` or git.
- **GitHub `schedule` is hours late:** NAV and price workflows are started on time by Cloudflare Cron Triggers (`web/worker/schedule.ts`, `wrangler.jsonc` `triggers.crons`, UTC); the snapshot follows the morning NAV run (`workflow_run`). Keep the cron keys and `triggers.crons` in step (`schedule.spec.ts` checks), and stay within 5 Cron Triggers (Workers Free).
- **Console warning NG01354 in dev and E2E** ("ngModel on a form control inside a child component cannot register with the NgForm"): expected. Dialog fields are projected into `app-edit-dialog`'s `<form>`, and pages keep form state in signals, not NgForm. It predates NPS and is harmless; no fix needed.
- **The 30-minute lock lives in the database** (`job_triggers`, `claim_job_trigger`); `COOLDOWN_MS` in `job-trigger.service.ts` must match it.
- **Date fields are PrimeNG DatePicker** (`shared/ui/date-input.ts`), not `<input type="date">`: E2E picks dates with `pickDate()` from `e2e/support/fixtures.ts` (phones cannot type into it). The wrapper also patches two axe findings in PrimeNG's calendar (an `aria-selected` on the day span, faint Today/Clear text in `styles.scss`); `accessibility.spec.ts` audits the open calendar.
- **CSP:** `script-src 'self'` means no inline scripts (critical-CSS inlining is off for that reason). `npm run build` writes `_headers`; check new external origins there.
- **Jobs and price sources:** fetch only codes and symbols present in the database, identify honestly as `portfolio-tracker-jobs/1.0`, never pose as a browser or get around bot checks (Stooq is out for that reason).
- **A new file missing from `git status`:** check `git check-ignore -v <file>`. `.gitignore` rules without a leading `/` match at any depth (an unanchored `data/` once hid new files in `core/data/` and broke the deployed build).
- **No fixed waits in E2E:** never `page.waitForTimeout` (SonarQube flags it, and it is either flaky or slow). Wait on a condition: `expect(...)` on a locator, `expect.poll`, `toPass` for retries, or `animationsDone(page)` from `e2e/support/fixtures.ts` before checking something a PrimeNG animation affects (contrast, scroll position, screenshots; `audit()` and `screenshot()` already call it).
- **E2E runs in parallel:** specs import `test` and `expect` from `e2e/support/fixtures.ts`, not `@playwright/test`. Each worker has its own users (`OWNER_EMAIL` and the others end in the worker's slot, from `TEST_PARALLEL_INDEX`) and starts signed in as its own owner. Rows every user shares (market data, `job_runs`, `job_triggers`): give each spec its own scheme codes and symbols, and wrap a test that deletes or rewrites shared rows in `exclusive()` (a lock across workers; see `sharedRowsTest` in `settings.spec.ts`). Clear only your address in Mailpit, never the whole inbox.
- **The owner's data never goes in git, logs or chat:** tools print counts, not rows; decrypted backups stay out of the repo.

## Definition of done (every task)
- Works at mobile and desktop widths
- Loading, empty and error states handled
- No lint errors, no TypeScript errors, tests pass
- RLS verified for any new table or view
- No secrets in the diff
