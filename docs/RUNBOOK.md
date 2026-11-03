# Runbook (fill in during Phase 10)

- Restore from backup: decrypt with `age -d -i key.txt backup.json.age > backup.json`, then run `scripts/restore.py backup.json` against an empty project.
- Rotate Supabase keys: regenerate in the dashboard, update GitHub Secrets and the Cloudflare env vars, redeploy.
- Add a new fund: Mutual Funds page > Add, search by name to get the AMFI scheme code.
- A job failed: open the GitHub Actions run, read the log, fix, and re-run with `workflow_dispatch`; jobs are idempotent.
