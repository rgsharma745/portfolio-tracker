// POST /api/jobs/:job: run a scheduled job now, from Settings › Job runs (docs/ARCHITECTURE.md).
// 1. The signed-in owner's Supabase token claims the job's 30-minute slot through
//    claim_job_trigger (PostgREST rejects a bad or expired token, so this also checks sign-in).
// 2. The GitHub workflow is dispatched with GITHUB_TOKEN (fine-grained, Actions write, this repo).
// 3. If GitHub refuses, the claim is released so the owner can retry at once.
// No service-role key here. Logs carry status codes only, never tokens or bodies.

export interface JobsEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
}

/** The jobs the website may run, and the workflow file that runs each. */
export const JOB_WORKFLOWS: Readonly<Record<string, string>> = {
  fetch_nav: 'nav.yml',
  fetch_prices: 'prices.yml',
};

export type TriggerResult =
  | { status: 'triggered'; nextAllowedAt: string; runUrl?: string }
  | { status: 'cooldown'; nextAllowedAt: string }
  | { status: 'error'; message: string };

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'portfolio-tracker-jobs/1.0';
const GITHUB_API_VERSION = '2026-03-10';
const ROUTE = /^\/api\/jobs\/([a-z_]+)\/?$/;

interface Claim {
  claimed: boolean;
  claimed_at: string;
  next_allowed_at: string;
}

type Fetch = typeof fetch;

export async function handleJobs(
  request: Request,
  env: JobsEnv,
  doFetch: Fetch = fetch,
): Promise<Response> {
  const match = ROUTE.exec(new URL(request.url).pathname);
  if (!match) return error(404, 'Not found');
  const job = match[1];
  const workflow = Object.hasOwn(JOB_WORKFLOWS, job) ? JOB_WORKFLOWS[job] : undefined;
  if (!workflow) return error(404, 'Unknown job');
  if (request.method !== 'POST') return error(405, 'Use POST', { Allow: 'POST' });

  const token = bearer(request);
  if (!token) return error(401, 'Sign in again');

  const { SUPABASE_URL, SUPABASE_ANON_KEY, GITHUB_REPO, GITHUB_TOKEN } = env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GITHUB_REPO || !GITHUB_TOKEN) {
    console.error('jobs: worker variables are not set');
    return error(503, 'Running jobs from the website is not set up');
  }

  const rpc = (fn: string, args: Record<string, unknown>) =>
    doFetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let claim: Claim;
  try {
    const resp = await rpc('claim_job_trigger', { p_job: job });
    if (resp.status === 401 || resp.status === 403) return error(401, 'Sign in again');
    if (!resp.ok) {
      console.error(`jobs: claim failed with ${resp.status}`);
      return error(502, 'Could not check when the job last ran');
    }
    const rows = (await resp.json()) as Claim[];
    if (!rows[0]) return error(502, 'Could not check when the job last ran');
    claim = rows[0];
  } catch {
    console.error('jobs: claim request failed');
    return error(502, 'Could not check when the job last ran');
  }

  if (!claim.claimed) {
    return json(
      429,
      { status: 'cooldown', nextAllowedAt: claim.next_allowed_at } satisfies TriggerResult,
      {
        'Retry-After': String(retryAfterSeconds(claim.next_allowed_at)),
      },
    );
  }

  try {
    const resp = await doFetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (resp.ok) {
      const runUrl = await readRunUrl(resp);
      return json(202, {
        status: 'triggered',
        nextAllowedAt: claim.next_allowed_at,
        ...(runUrl ? { runUrl } : {}),
      } satisfies TriggerResult);
    }
    console.error(`jobs: GitHub dispatch failed with ${resp.status}`);
  } catch {
    console.error('jobs: GitHub dispatch request failed');
  }

  try {
    await rpc('release_job_trigger', { p_job: job, p_at: claim.claimed_at });
  } catch {
    console.error('jobs: release request failed');
  }
  return error(502, 'GitHub did not start the job. Try again.');
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/** GitHub returns the new run's links (200) on recent API versions; older ones answer 204. */
async function readRunUrl(resp: Response): Promise<string | undefined> {
  if (resp.status === 204) return undefined;
  try {
    const body = (await resp.json()) as { html_url?: unknown };
    return typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/')
      ? body.html_url
      : undefined;
  } catch {
    return undefined;
  }
}

export function retryAfterSeconds(nextAllowedAt: string, now = Date.now()): number {
  const ms = Date.parse(nextAllowedAt) - now;
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 1000)) : 60;
}

function error(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json(status, { status: 'error', message } satisfies TriggerResult, headers);
}

function json(status: number, body: TriggerResult, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
