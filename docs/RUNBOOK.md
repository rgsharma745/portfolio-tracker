# Runbook (fill in during Phase 10)

- Make the backup key (once): `age-keygen -o backup-key.txt`. Put the printed public key (`age1...`) in the GitHub secret `BACKUP_AGE_RECIPIENT`; keep `backup-key.txt` offline (password manager). Without it the backups cannot be read.
- Get a backup: GitHub › Actions › Backup › a run › Artifacts (kept 90 days). Decrypt with `age -d -i backup-key.txt backup-YYYY-MM-DD.json.age > backup.json`. The JSON has one array of rows per table (`tables.portfolios`, `tables.mf_holdings`, ...). A restore script is planned for Phase 10; until then rows can be re-imported with the SQL editor or CSV import (docs/DATA_ENTRY.md).
- Run a job by hand: GitHub › Actions › (NAV, Prices, Snapshot, Backup, Keep-alive) › Run workflow. Locally against the local stack: see AGENTS.md (Scripts).
- Rotate Supabase keys: regenerate in the dashboard, update GitHub Secrets and the Cloudflare build variables (Worker › Settings › Build › Variables and secrets), redeploy.
- Sign-in email (once, and after any Supabase project change): Supabase › Authentication › Emails › Magic link: subject `Your sign-in link`, body = the HTML in `supabase/templates/magic_link.html` (it adds the code that the iPhone home-screen app needs). The local stack reads the same file from `supabase/config.toml`.
- Install the app: iPhone Safari › Share › Add to Home Screen; Android Chrome › menu › Install app. In the installed iPhone app, sign in with the code from the email (the link opens Safari, which has separate storage).
- After a deploy, open apps show "A new version of the app is ready" with Reload; a closed app picks the new version up on its next start.
- Add a new fund: Mutual Funds › Add fund, with its AMFI scheme code (amfiindia.com NAV pages or mfapi.in). Its NAV appears after the next NAV run.
- A price is wrong or a source is down: Settings › Manual prices sets the price (or USD/INR) by hand; the jobs leave it alone until you remove it.
- A job failed: open the GitHub Actions run, read the log, fix, and re-run with `workflow_dispatch`; jobs are idempotent.
