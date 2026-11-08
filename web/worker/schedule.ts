// Cloudflare Cron Triggers start the time-sensitive jobs on time (docs/ARCHITECTURE.md, "Jobs").
// GitHub's own `schedule` runs often start hours late or are dropped, so at each cron below
// the Worker starts the job's workflow through workflow_dispatch, which GitHub runs within a
// minute or so. The workflows keep their GitHub schedules as a fallback: jobs are idempotent,
// so a second run is harmless. The snapshot follows the morning NAV run (snapshot.yml,
// workflow_run), so it needs no cron of its own.
//
// Cron Triggers run in UTC (IST is UTC+5:30). Every key here must be listed in
// wrangler.jsonc `triggers.crons` (schedule.spec.ts checks both ways). Workers Free allows
// 5 Cron Triggers per account; this uses 4.
import { JobsEnv, JOB_WORKFLOWS, dispatchWorkflow, Fetch } from './jobs';

export const SCHEDULES: Readonly<Record<string, string>> = {
  '7 18 * * *': 'fetch_nav', // 23:37 IST daily
  '47 2 * * *': 'fetch_nav', // 08:17 IST daily, then the snapshot follows
  '43 13 * * MON-FRI': 'fetch_prices', // 19:13 IST Mon–Fri, after NSE's bhavcopy
  '53 22 * * MON-FRI': 'fetch_prices', // 04:23 IST Tue–Sat, after the US close
};

/**
 * Starts the job scheduled for `cron`. Throws on an unknown cron, missing settings or a
 * refused dispatch, so Cloudflare records the invocation as failed (Workers Logs). There is
 * no 30-minute Run now lock here: that lock is for the website button only.
 */
export async function handleScheduled(
  cron: string,
  env: JobsEnv,
  doFetch: Fetch = fetch,
): Promise<string> {
  const job = Object.hasOwn(SCHEDULES, cron) ? SCHEDULES[cron] : undefined;
  if (!job) throw new Error(`schedule: no job for cron "${cron}"`);
  const workflow = JOB_WORKFLOWS[job];
  const { GITHUB_REPO, GITHUB_TOKEN } = env;
  if (!GITHUB_REPO || !GITHUB_TOKEN)
    throw new Error('schedule: GITHUB_REPO or GITHUB_TOKEN is not set');
  const { ok } = await dispatchWorkflow(GITHUB_REPO, GITHUB_TOKEN, workflow, doFetch);
  if (!ok) throw new Error(`schedule: GitHub did not start ${workflow}`);
  console.log(`schedule: started ${workflow} for ${cron}`);
  return workflow;
}
