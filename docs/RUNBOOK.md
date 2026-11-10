# Runbook

How to run, fix and recover the portfolio tracker. Commands run from the repo root unless a step says otherwise. Anything marked *secret* goes only where the step says, never in git, chat or a ticket.

## Where things live
| What | Where |
|---|---|
| Site | https://portfolio-tracker.rgsharma745.workers.dev, from Cloudflare › Workers & Pages › `portfolio-tracker` (deploys on every push to `main`) |
| Database and sign-in | Supabase project (Authentication, Table Editor, Project Settings › API Keys) |
| Scheduled jobs and backups | GitHub › Actions (NAV, Prices, Snapshot, Backup, Keep-alive) |
| Job results | The app: Settings › Job runs |
| Sign-in emails | Supabase › Authentication › Emails (custom SMTP: Gmail with an App Password) |
| Backup key (private) | Your password manager, note "Portfolio backup key" |
| Dependency updates | GitHub issue "Dependency Dashboard" (Renovate) |

Secrets and where each one is set:
| Secret | Used by | Set in |
|---|---|---|
| Supabase URL + publishable (anon) key | the site (public by design) | Cloudflare › Worker › Settings › Build › Variables and secrets (`NG_APP_SUPABASE_URL`, `NG_APP_SUPABASE_ANON_KEY`) |
| PrimeUI licence key | the site | Cloudflare build variable `NG_APP_PRIMEUI_LICENSE` |
| Supabase secret (service role) key *secret* | the jobs only | GitHub › Settings › Secrets › Actions `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_URL`) |
| age public key | the Backup job | GitHub secret `BACKUP_AGE_RECIPIENT` |
| age private key *secret* | you, to decrypt | password manager only |
| Gmail App Password *secret* | Supabase SMTP | Supabase › Authentication › Emails › SMTP Settings |
| Supabase URL + publishable key, `GITHUB_REPO` | the Run now Worker | Cloudflare › Worker › Settings › Variables and secrets (runtime, *not* Build): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GITHUB_REPO` as Text |
| GitHub fine-grained token *secret* | the Run now Worker | same place, `GITHUB_TOKEN` as Secret |

## Backups

**What is backed up:** every row of your own data (portfolios, funds, stocks, RSU grants, savings, cards, bills, PF entries, history, settings), every Sunday 08:41 IST. Market data (NAVs, prices, USD/INR) is not: the jobs fetch it again. Backups are encrypted before they are written and kept 90 days as GitHub artifacts.

**Make the key (once):** `age-keygen -o ~/portfolio-backup-key.txt`, save the file in your password manager, and put the printed `age1…` public key in the GitHub secret `BACKUP_AGE_RECIPIENT`. Without the private key no one, including you, can read the backups.

**Get a backup:** GitHub › Actions › Backup › the run you want › Artifacts › download and unzip. You get `backup-YYYY-MM-DD.json.age`. For a fresh one first: Backup › Run workflow.

**Look inside (optional):** `age -d -i ~/portfolio-backup-key.txt backup-YYYY-MM-DD.json.age | head -c 300`. Delete any decrypted copy afterwards: it is your data in plain text.

### Restore a backup
`scripts/tools/restore.py` puts a backup back. It reads the `.age` file directly (decrypted in memory), always shows a plan first (rows in the backup and in the database now) and asks you to type `RESTORE`. It prints table names and counts only, never your data. If anything fails it puts the database back as it was.

Setup once: `cd scripts && python3.15 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`, and `brew install age`.

Give the script the target project without leaving the secret key in your shell history:
```
cd scripts
export SUPABASE_URL=https://<project>.supabase.co
read -s "SUPABASE_SERVICE_ROLE_KEY?Supabase secret key: "; export SUPABASE_SERVICE_ROLE_KEY; echo
```

**A. Rows were lost or broken, same project.** Restore exactly the backup, replacing what is there now (changes made after the backup are lost, so take a fresh backup first if in doubt):
```
.venv/bin/python -m tools.restore ~/Downloads/backup-YYYY-MM-DD.json.age \
  --identity ~/portfolio-backup-key.txt --replace
```

**B. The project is gone: start a new one.**
1. Create a Supabase project (free tier). Project Settings › Data API: enabled, "Automatically expose new tables" off.
2. SQL editor: run `supabase/migrations/0001_init.sql` (and any later numbered files, in order).
3. Authentication: turn off "Allow new users to sign up"; add your user (Users › Add user, your email); set Site URL and redirect URLs to the site and `http://localhost:4200/**`; set up SMTP and the Magic link template (below).
4. Point the site and jobs at it: Cloudflare build variables `NG_APP_SUPABASE_URL` / `NG_APP_SUPABASE_ANON_KEY`, then Deployments › Retry the latest build; GitHub secrets `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
5. Restore into your new user (its id differs from the old project's):
   ```
   .venv/bin/python -m tools.restore ~/Downloads/backup-YYYY-MM-DD.json.age \
     --identity ~/portfolio-backup-key.txt --owner-email you@example.com
   ```
6. Run NAV, then Prices, then Snapshot from GitHub › Actions, and check the Overview totals.

**Rehearse a restore (recommended once a year):** restore a real backup into the local database, never production, and look at it in the app:
```
cd web && npm run db:start && cd ../scripts
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=$(cd .. && npx -y supabase@3.0.0 status -o json | python3 -c 'import json,sys;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')
.venv/bin/python -m tools.restore ~/Downloads/backup-YYYY-MM-DD.json.age \
  --identity ~/portfolio-backup-key.txt --owner-email test@portfolio-tracker.com --replace
```
Then `cd ../web && npm run start:local`, sign in as `test@portfolio-tracker.com` (link in Mailpit, http://127.0.0.1:54324) and compare with the live site. Afterwards `npm run db:reset` wipes the local copy.

## Jobs

| Job | When (IST) | Writes |
|---|---|---|
| NAV | 23:37 daily, retry 08:17 | mutual fund NAVs (AMFI) for the codes you hold |
| Prices | 19:13 Mon–Fri, 04:23 Tue–Sat (after the US close) | stock prices (NSE, then Yahoo) for the symbols you hold, and USD/INR |
| Snapshot | 08:37 daily | one history row per active portfolio (Overview chart) |
| Backup | Sunday 08:41 | encrypted backup artifact |
| Keep-alive | Wednesday 11:19 | one tiny query so the free project never pauses |

Schedules are set in IST in the workflow files (`timezone: Asia/Kolkata`). GitHub can still start a scheduled run late (on 5 Nov 2026 the NAV run started over 5 hours late) or, under heavy load, skip it; the odd minutes make that less likely. If NAVs look stale, use Settings › Job runs › Run now. Every run is listed in Settings › Job runs; a failed run also sends GitHub's failure email.

**Jobs start late or not at all:** NAVs and prices are started by Cloudflare Cron Triggers (Cloudflare › Workers › portfolio-tracker › Settings › Triggers lists them; Observability › Logs shows `schedule: started …` or `schedule: GitHub did not start …`). A 401 or 403 from GitHub means the Worker's `GITHUB_TOKEN` expired or lost Actions write: create a new fine-grained token and set it as the Worker secret. Without the Worker, the GitHub schedules still run, only hours late. The snapshot follows the morning NAV run; if it is missing, check that NAV run, or run Snapshot by hand.

**Run a job by hand:** in the app, Settings › Job runs › Run now (NAVs, which also refreshes NPS NAVs, and prices; once every 30 minutes per job). Or GitHub › Actions › the job › Run workflow (or `gh workflow run nav.yml`), which has no lock. Jobs are idempotent: re-running one is always safe.

**Run now says:**
| Message | Cause | Fix |
|---|---|---|
| Already run in the last 30 minutes | the lock is working | wait until the time shown, or use GitHub › Actions |
| Running jobs from the website is not set up | a Worker variable is missing | set the four values in "Set up Run now" below |
| GitHub did not start the job | `GITHUB_TOKEN` expired, revoked or lacks Actions write; or `GITHUB_REPO` is wrong | make a new token (below); the lock was released, so retry at once |
| Sign in again | the session expired | sign in again |

### Set up Run now (once)
1. GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access: **only this repository**. Permissions: **Actions: Read and write** (nothing else). Pick an expiry and put the date in your calendar.
2. Cloudflare › Workers & Pages › `portfolio-tracker` › Settings › Variables and secrets (runtime, not Build): add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the same values as the `NG_APP_*` build variables), `GITHUB_REPO` (`owner/repo`) as Text, and `GITHUB_TOKEN` as Secret.
3. Apply `supabase/migrations/0002_job_triggers.sql`, then `0003_tighten_shared_tables.sql`, to the production project (SQL editor or `supabase db push`), before the push that deploys the button.
4. Open Settings › Job runs › Run now on NAVs. The row says "Started", a run appears in GitHub › Actions › NAV, and its result shows in Job runs a minute or two later.

**A job failed:** open the run in GitHub › Actions, read the last lines of the log (the same message is in Settings › Job runs), then:
| Message | Cause | Fix |
|---|---|---|
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`, or `Could not read … (HTTP 401)` | secret missing or rotated | update the GitHub secret, re-run |
| NAV: `The AMFI file looked empty or broken` | AMFI's file was down or half-written | re-run later (the 08:17 retry usually fixes it) |
| NAV: codes `not found in the AMFI file` (success with a warning) | a fund's scheme code is wrong or the fund was merged | fix the code on the Mutual Funds page (amfiindia.com or mfapi.in) |
| Prices: `No prices could be fetched` | NSE and Yahoo both unreachable | re-run later; meanwhile Settings › Manual prices |
| Prices: `no price for SYMBOL` | the symbol is wrong or delisted | fix it on the Stocks page, or set a manual price |
| Prices: `Could not fetch the USD/INR rate from any source` | Frankfurter and Yahoo both down | re-run later, or set USD/INR in Settings › Manual prices |
| Backup: `BACKUP_AGE_RECIPIENT must be an age public key` | secret missing or wrong | set it to the `age1…` line from your key file |
| HTTP 5xx from Supabase, or the project shows "Paused" | outage or a paused free project | Supabase dashboard › Restore project; re-run the jobs |

A price is wrong or a source is down for days: Settings › Manual prices sets the price (or USD/INR) by hand; the jobs leave it alone until you remove it.

## Rotate keys
Do one at a time and check the app or a job afterwards.

- **Supabase secret key** (if it may have leaked, at once): Project Settings › API Keys › create a new secret key › update the GitHub secret `SUPABASE_SERVICE_ROLE_KEY` › run Keep-alive to check it works › delete the old key.
- **Supabase publishable key:** create a new publishable key › update the Cloudflare build variable `NG_APP_SUPABASE_ANON_KEY` › Deployments › Retry the latest build › once the site works with it (open apps show the update banner), delete the old key.
- **Backup key:** `age-keygen` a new one, save it, update `BACKUP_AGE_RECIPIENT`. Keep the old private key for 90 days: older backups still need it.
- **Gmail App Password:** Google Account › App passwords › revoke the old one and create a new one › Supabase › Authentication › Emails › SMTP Settings › paste it › send yourself a sign-in email.
- **Run now GitHub token (before it expires):** generate a new fine-grained token as in "Set up Run now" › Cloudflare › Worker › Variables and secrets › `GITHUB_TOKEN` › replace › press Run now once to check › delete the old token in GitHub.
- **SonarQube token (before it expires):** generate a new one as in "SonarQube" step 4, replace the GitHub secret `SONAR_TOKEN`, re-run CI, revoke the old token.
- **PrimeUI licence (yearly):** update `NG_APP_PRIMEUI_LICENSE` in Cloudflare and retry the latest build. Without it PrimeNG shows a licence notice; nothing breaks.

## Everyday tasks
- **Add a new fund:** Mutual Funds › Add fund, with its AMFI scheme code (amfiindia.com NAV pages or mfapi.in). Its NAV appears after the next NAV run (or run NAV by hand).
- **Add a stock:** Stocks › Add stock, with the NSE symbol (India) or ticker (US). Its price appears after the next Prices run.
- **A new month of card bills:** Credit cards › "Create this month's bills", then enter each amount when the statement arrives.
- **Install the app:** iPhone Safari › Share › Add to Home Screen; Android Chrome › menu › Install app. In the installed iPhone app sign in with the code from the email (the link opens Safari, which has separate storage).
- **After a deploy:** an open app shows "A new version of the app is ready" with Reload: when you return to it, within 30 minutes if it stays on screen, or straight after a reload. Cloudflare takes a minute or two to finish the deploy first.
- **Sign-in email template** (after any Supabase project change): Authentication › Emails › Magic link: subject `Your sign-in link`, body = `supabase/templates/magic_link.html`. Editing templates needs custom SMTP. The app accepts codes of any length Supabase sends (6 to 10 digits). The local stack reads the same file from `supabase/config.toml`.

- **Dependency updates (Renovate, Monday mornings IST):** merge each PR once CI is green. Majors wait on the Dependency Dashboard for approval; read PrimeNG majors' release notes first (AGENTS.md). TypeScript minors and majors are not offered at all, because Angular's compiler accepts only the TypeScript minor it was built for (Angular 22: 6.0): when an Angular major's PR fails because it needs a newer TypeScript, bump TypeScript on that branch (`ng update` does both). A Renovate PR whose CI fails at `npm ci` with "package.json and package-lock.json … in sync" has a stale lockfile: ask Renovate to rebase it (tick its box on the PR), or run `npm install` on its branch and push.
- **CI is slow or fails on time:** a normal run takes about 10 minutes, Playwright about 7 on 2 workers. The first run after a Playwright upgrade also installs browsers and their system libraries (2–3 minutes). If Ubuntu's mirror is slow that step stops after 10 minutes (it once took 30): re-run the failed job. A test that fails with "Test timeout of 60000ms exceeded" at a different step on each attempt ran out of time on the slow runner rather than hanging.

## SonarQube
Code quality, security hotspots and coverage on SonarQube Cloud (Free plan: private code up to 50k lines; the whole repo, tests included, is about 28k). CI's integration job scans after pytest (`sonar-project.properties` at the repo root). Report only: results show on the dashboard and on PRs into main, and a failing quality gate (default "Sonar way", which looks at new code) never fails CI. Until the `SONAR_TOKEN` secret exists the scan steps are skipped.

Set up once:
1. sonarcloud.io › Log in with GitHub › create an organization from your GitHub account (Free plan) › Analyze new project › `portfolio-tracker`. Install the SonarQube Cloud GitHub app on this repository only when asked (it adds the PR comments).
2. Check the keys in Administration › Project information match `sonar-project.properties` (`sonar.organization=rgsharma745`, `sonar.projectKey=rgsharma745_portfolio-tracker`); if not, change the file.
3. Administration › Analysis Method › turn **Automatic Analysis off** (CI does the scan; with both on, the CI scan fails).
4. My Account › Security › generate a token (type: project analysis, for this project, with an expiry) › GitHub › Settings › Secrets and variables › Actions › New secret `SONAR_TOKEN`.
5. Push, or re-run CI: the "SonarQube" step uploads the analysis; the dashboard fills a minute later.

Notes:
- New code is measured from the previous version by default; set Administration › New Code to "Number of days: 30" if that suits better.
- Coverage: the app's unit tests (`npm run test:sonar`, lcov of all of `src/app`; `npm run test:coverage` still gates `core/calc` at 90%) and pytest (`pytest --cov --cov-report=xml` in `scripts/`). The Worker and `web/scripts` are analysed but excluded from coverage.
- If the scan fails (Sonar outage, expired token) CI stays green and the step shows a warning; renew the token as in step 4.
- To stop: delete the `SONAR_TOKEN` secret (the steps skip), then delete the project in SonarQube Cloud.

## Checks
- **Security checklist:** `docs/SECURITY.md` › Checklist.
- **RLS on production (optional):** creates and deletes two throwaway `pytest-…@example.com` users; your rows are never read or changed. Run only `test_rls.py` against production, never the whole suite (the job tests write market data):
  ```
  cd scripts
  read -s "SRK?Supabase secret key: "; echo
  TEST_SUPABASE_URL=https://<project>.supabase.co TEST_SUPABASE_ANON_KEY=<publishable key> \
    TEST_SUPABASE_SERVICE_ROLE_KEY="$SRK" .venv/bin/pytest tests/test_rls.py; unset SRK
  ```
