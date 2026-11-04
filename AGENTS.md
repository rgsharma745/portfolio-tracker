# AGENTS.md

Instructions for AI coding agents (Claude Code) working on this repo. Read this fully before making changes. Also read `PLAN.md` and the files in `docs/`.

## Project summary
Personal portfolio tracker for ONE login (the owner), with several portfolios under it (for example the owner and the owner's wife; portfolios are labels, not accounts). It tracks Indian mutual funds, stocks (India and US), RSUs, savings balances and credit card dues. Data lives in Supabase Postgres. The site is a static Angular app on Cloudflare Pages. Scheduled GitHub Actions load daily NAVs and prices. It replaces an existing Google Sheet and must reach feature parity with it (see `docs/SHEET_MAPPING.md`).

## Tech stack (do not swap without asking)
- Angular (latest stable), standalone components, signals, TypeScript strict mode
- PrimeNG (Aura theme, light and dark) for UI components; Tailwind CSS only for layout utilities. PrimeNG is under the PrimeUI license (not MIT): the owner uses a free Community License key, supplied as `NG_APP_PRIMEUI_LICENSE` and renewed yearly
- Supabase: Postgres, Auth, Row Level Security. Client: `@supabase/supabase-js`
- Charts: Chart.js used directly through the shared `app-chart` component (not PrimeNG Chart, which is deprecated in favor of paid PrimeUI PRO Charts)
- Jobs and scripts: Python 3.12 (`scripts/`), run by GitHub Actions
- Hosting: Cloudflare Pages (static build, no SSR)
- Tests: Vitest or Jasmine for unit tests, Playwright for end-to-end, pytest for scripts

### PrimeNG licensing guards
- Do not use PrimeNG components that are deprecated in favor of PrimeUI PRO (paid), currently Chart and Editor. Check the component's `@deprecated` notes before adopting it.
- Feature pages use the shared `DataTable` wrapper (`web/src/app/shared/`), never PrimeNG `Table` directly, so the table can be replaced in one place if it ever moves to PRO. Simple primitives (buttons, inputs, tags) may be used directly.
- Stay on the current PrimeNG major. Before upgrading to a new major, read its release notes for components moving to PRO. Dependency bots must not auto-merge PrimeNG majors.

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
- Install: `cd web && npm ci` (first time for E2E: `npx playwright install chromium`)
- Dev server: `cd web && npm start` (http://localhost:4200)
- Unit tests: `cd web && npm test` (Vitest, single run; `npm run test:watch` to watch)
- E2E: `cd web && npm run e2e` (Playwright at 390x844 and 1440x900; starts the dev server)
- Lint and format check: `cd web && npm run lint` (ESLint + Prettier check); fix formatting with `npm run format`
- Build: `cd web && npm run build` (output `web/dist/portfolio-tracker/browser`)
- Environment: `web/scripts/set-env.mjs` runs before start/build/test/lint and writes the git-ignored `web/src/environments/env.ts` from `NG_APP_SUPABASE_URL`, `NG_APP_SUPABASE_ANON_KEY` and `NG_APP_PRIMEUI_LICENSE`. It reads the process environment first, then `web/.env`, then the repo-root `.env`. It refuses a service-role/secret key and fails on Cloudflare Pages (`CF_PAGES`) if the Supabase variables are missing.
- Local database: `npx -y supabase@3.0.0 start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio` (repo root, Docker required); reset after a migration change with `npx -y supabase@3.0.0 db reset`; stop with `npx -y supabase@3.0.0 stop`
- Generate DB types: `cd web && npm run gen:types` (from the local database; CI fails if `db.types.ts` is out of date)
- Scripts setup: `cd scripts && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`
- Scripts tests: `cd scripts && .venv/bin/pytest` (targets the local database; set `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` to target another project)

## Hard rules
1. **Security first.** Every table has Row Level Security enabled and an owner policy. Never disable RLS, never add a policy that allows anonymous access. See `docs/SECURITY.md`.
2. **Secrets.** The Supabase service role key is only used in `scripts/` and GitHub Actions. It must never appear in `web/`, in logs, or in git. Never commit `.env`.
3. **Money.** Use Postgres `numeric` for money and units, never floats. In TypeScript keep values as numbers only for display math and round only at the display layer. Format INR with the `en-IN` locale (lakh/crore grouping, e.g. ₹56,74,412). Format USD with `en-US`.
4. **Migrations.** Schema changes only through a new numbered file in `supabase/migrations/`. Never edit a migration that has already been applied.
5. **Keep it light.** No transaction ledger and no NAV or price history tables: holdings are entered as units and invested amounts, and market data is latest-only (see `docs/DATA_MODEL.md`). Do not add history tables or ledgers without asking.
5a. **Portfolios.** Every holding, savings account, card and RSU grant belongs to a `portfolio_id`. Totals default to all active portfolios; the portfolio switcher scopes every page.
5b. **Credit cards are monthly.** Bills are one row per card per month (`card_bills`) with a derived status; never store status or a single "pending amount" on the card.
5c. **No invented data.** Never hardcode sample portfolio values in production code. Use fixtures only in tests.
6. **One login.** Public sign-up is disabled. Do not build registration, per-portfolio logins or sharing features.
7. **No import tooling.** The owner loads their own data (see `docs/DATA_ENTRY.md`). Do not write scripts that read the Google Sheet.
8. **Ask before** adding a new paid service, a new major dependency, or anything that is not free-tier.

## Responsive requirement (applies to every page)
- Mobile first. Must be usable at 360px width and on desktop at 1440px.
- Breakpoints: mobile < 768px, tablet 768 to 1023px, desktop >= 1024px.
- Mobile: bottom navigation bar, cards instead of wide tables for holdings lists, touch targets at least 44px, dialogs become full-screen sheets.
- Desktop: left sidebar navigation, full data tables with sorting, filtering and totals.
- No horizontal page scroll on any viewport. Wide tables scroll inside their own container.
- Respect `prefers-color-scheme`; support a manual light/dark toggle. Respect iOS safe-area insets.
- Every new page needs a Playwright check at 390x844 and 1440x900.
See `docs/UI_SPEC.md`.

## Code conventions
- Standalone components, `ChangeDetectionStrategy.OnPush`, signals for state, `inject()` for DI.
- One feature per folder under `web/src/app/features/<name>/` (page component, service, models, tests).
- Shared UI under `web/src/app/shared/`. Supabase access only through services in `web/src/app/core/data/`, never directly in components.
- Calculation logic (value, P&L, day change, XIRR if added) lives in pure functions in `web/src/app/core/calc/` with unit tests.
- Types for database rows are generated with `supabase gen types typescript` into `web/src/app/core/db.types.ts`. Do not hand-write them.
- Small, readable functions; no `any`; handle loading, empty and error states on every page.
- Python scripts: typed, `requests` with timeouts and retries, idempotent (safe to re-run), exit non-zero on failure, never print secrets.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). One logical change per commit.

## Workflow
1. Work through `PLAN.md` phase by phase. Tick the checkbox when a task is done and meets its acceptance criteria.
2. Before finishing a phase: run lint, unit tests, build, and (if UI changed) Playwright. Report results.
3. Stop at the end of each phase and summarise what was done and what the human must do next.
4. If something in the docs is unclear or conflicts with reality (for example, a sheet column differs from `SHEET_MAPPING.md`), stop and ask rather than guess.
5. Keep `docs/` updated when behaviour changes.

## Definition of done (every task)
- Works at mobile and desktop widths
- Loading, empty and error states handled
- No lint errors, no TypeScript errors, tests pass
- RLS verified for any new table or view
- No secrets in the diff
