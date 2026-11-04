# Portfolio Tracker

A private, free-to-host personal finance dashboard (mutual funds, stocks, RSUs, savings, credit cards) that replaces a Google Sheet. Responsive: works on desktop and mobile.

## Stack
Angular + PrimeNG (frontend) · Supabase (Postgres + Auth + RLS) · Cloudflare Workers static assets (hosting) · GitHub Actions (scheduled NAV/price jobs, backups).

## How to use this folder with Claude Code
1. Create an empty git repo and copy everything in this folder into its root.
2. Open the repo in Claude Code and say:
   > Read AGENTS.md and PLAN.md. Start at Phase 0 and work through the phases in order. Stop at the end of each phase so I can review.
3. Claude Code will ask you for things only you can do (creating the Supabase project, Cloudflare project, secrets). These are listed under "Human tasks" in each phase of PLAN.md.

## Files
| File | Purpose |
|---|---|
| `AGENTS.md` | Rules and conventions Claude Code must follow (also read via `CLAUDE.md`) |
| `PLAN.md` | Phased implementation plan with tasks and acceptance criteria |
| `docs/ARCHITECTURE.md` | System design, folder layout, data flow, jobs |
| `docs/DATA_MODEL.md` | Tables, relationships, calculation formulas |
| `docs/SHEET_MAPPING.md` | How the existing Google Sheet maps to the database (reference for your own data loading) |
| `docs/DATA_ENTRY.md` | How to load your data into Supabase yourself (CSV headers, order, SQL) |
| `docs/UI_SPEC.md` | Pages, components, responsive behaviour |
| `docs/SECURITY.md` | Security requirements and checklist |
| `supabase/migrations/0001_init.sql` | Starting schema with Row Level Security |
| `.env.example` | Environment variables needed |
