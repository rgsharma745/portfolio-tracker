# Portfolio Tracker

A private, free-to-host personal finance dashboard (mutual funds, Indian and US stocks, employee equity (RSUs and ESOPs), savings, credit card dues, PF, PPF, NPS, fixed deposits and dividends) that replaces a Google Sheet. One owner login, several portfolios (for example Me and Wife). Responsive, installable on a phone, light and dark.

Live: deployed on Cloudflare Workers (sign-in only; not indexed by search engines)

## Stack
Angular 22 + PrimeNG (Aura) + Tailwind for layout · Supabase (Postgres, Auth, Row Level Security) · Cloudflare Workers static assets (hosting) · GitHub Actions running Python 3.15 jobs (nightly NAVs, prices, daily snapshot, weekly encrypted backup).

## Status
Phases 0 to 18 of [the implementation plan](PLAN.md) are built and live. Phase 18 adds CAMS transaction imports, closed mutual fund positions and XIRR. Phase 19 replaces the RSU page with the Employee Equity ledger. The Overview includes separate Investments and Savings and dues panels, with expandable History, Allocation and By portfolio sections. The remaining work is owner acceptance and data reconciliation (see the **Status** section at the top of `PLAN.md`). Recent maintenance hardened CI dependency installs, hash-locked Python dependencies with Renovate updates, and aligned SonarCloud's analysis scope with its current scanner behavior. The Employee Equity cutover is pending.

## Working on it with Claude Code
Open the repo and start a new chat with, for example:
> Read AGENTS.md, then the Status section of PLAN.md. <what you want to do>.

`CLAUDE.md` points Claude Code at `AGENTS.md`, which holds the rules, commands and conventions. The docs below are the source of truth for behaviour; keep them current when something changes.

## Files
| File | Purpose |
|---|---|
| `AGENTS.md` | Rules, commands and conventions for coding agents (read via `CLAUDE.md`) |
| `PLAN.md` | Status, then the phased plan with tasks and acceptance criteria |
| `docs/ARCHITECTURE.md` | System design, folder layout, data flow, jobs, decisions |
| `docs/DATA_MODEL.md` | Tables, relationships, calculation formulas |
| `docs/UI_SPEC.md` | Pages, components, responsive and accessibility rules |
| `docs/SECURITY.md` | Security requirements and the go-live checklist |
| `docs/RUNBOOK.md` | Operating it: backups and restore, job failures, key rotation, everyday tasks |
| `docs/DATA_ENTRY.md` | Loading your own data (CSV headers, order, SQL) |
| `docs/SHEET_MAPPING.md` | How the old Google Sheet maps to the database |
| `supabase/migrations/` | Schema with Row Level Security (numbered, never edited after applying) |
| `.env.example` | Environment variables for local development |
