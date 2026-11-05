import { describe, expect, it, vi } from 'vitest';
import { JobsEnv, handleJobs, retryAfterSeconds } from './jobs';

const ENV: JobsEnv = {
  SUPABASE_URL: 'https://db.example.test/',
  SUPABASE_ANON_KEY: 'anon-key',
  GITHUB_REPO: 'owner/repo',
  GITHUB_TOKEN: 'gh-token',
};
const CLAIMED = {
  claimed: true,
  claimed_at: '2026-11-05T10:00:00+00:00',
  next_allowed_at: '2026-11-05T10:30:00+00:00',
};
const LOCKED = {
  claimed: false,
  claimed_at: '2026-11-05T10:00:00+00:00',
  next_allowed_at: '2026-11-05T10:30:00+00:00',
};

function req(path = '/api/jobs/fetch_nav', init: RequestInit = {}): Request {
  return new Request(`https://app.example.test${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token' },
    ...init,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch stub answering Supabase RPCs and the GitHub dispatch, recording each call. */
function stub(answers: { claim?: Response; github?: Response | Error; release?: Response }) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/rpc/claim_job_trigger'))
      return answers.claim ?? jsonResponse(200, [CLAIMED]);
    if (url.endsWith('/rpc/release_job_trigger'))
      return answers.release ?? new Response(null, { status: 204 });
    if (url.startsWith('https://api.github.com/')) {
      if (answers.github instanceof Error) throw answers.github;
      return answers.github ?? new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${url}`);
  });
}

const calledUrls = (f: ReturnType<typeof stub>) => f.mock.calls.map(([u]) => String(u));

describe('handleJobs', () => {
  it('404s an unknown job without calling anything', async () => {
    const f = stub({});
    const resp = await handleJobs(req('/api/jobs/backup'), ENV, f);
    expect(resp.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it('405s anything but POST', async () => {
    const f = stub({});
    const resp = await handleJobs(req('/api/jobs/fetch_nav', { method: 'GET' }), ENV, f);
    expect(resp.status).toBe(405);
    expect(resp.headers.get('Allow')).toBe('POST');
    expect(f).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const f = stub({});
    const resp = await handleJobs(req('/api/jobs/fetch_nav', { headers: {} }), ENV, f);
    expect(resp.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('503s when the worker is not configured', async () => {
    const f = stub({});
    const resp = await handleJobs(req(), { ...ENV, GITHUB_TOKEN: '' }, f);
    expect(resp.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it('401s when Supabase rejects the token, and does not dispatch', async () => {
    const f = stub({ claim: jsonResponse(401, { message: 'JWT expired' }) });
    const resp = await handleJobs(req(), ENV, f);
    expect(resp.status).toBe(401);
    expect(calledUrls(f).some((u) => u.includes('github'))).toBe(false);
  });

  it('claims with the user token and the anon key', async () => {
    const f = stub({});
    await handleJobs(req(), ENV, f);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://db.example.test/rest/v1/rpc/claim_job_trigger');
    const headers = init.headers as Record<string, string>;
    expect(headers['apikey']).toBe('anon-key');
    expect(headers['Authorization']).toBe('Bearer user-token');
    expect(JSON.parse(init.body as string)).toEqual({ p_job: 'fetch_nav' });
  });

  it('429s with Retry-After while locked, and does not dispatch', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-05T10:20:00Z') });
    try {
      const f = stub({ claim: jsonResponse(200, [LOCKED]) });
      const resp = await handleJobs(req(), ENV, f);
      expect(resp.status).toBe(429);
      expect(resp.headers.get('Retry-After')).toBe('600');
      expect(await resp.json()).toEqual({
        status: 'cooldown',
        nextAllowedAt: LOCKED.next_allowed_at,
      });
      expect(calledUrls(f).some((u) => u.includes('github'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispatches the mapped workflow on main and answers 202', async () => {
    const f = stub({});
    const resp = await handleJobs(req('/api/jobs/fetch_prices'), ENV, f);
    expect(resp.status).toBe(202);
    expect(resp.headers.get('Cache-Control')).toBe('no-store');
    expect(await resp.json()).toEqual({
      status: 'triggered',
      nextAllowedAt: CLAIMED.next_allowed_at,
    });
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/owner/repo/actions/workflows/prices.yml/dispatches',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer gh-token');
    expect(headers['User-Agent']).toBe('portfolio-tracker-jobs/1.0');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' });
  });

  it('passes back the run link when GitHub returns one', async () => {
    const f = stub({
      github: jsonResponse(200, {
        workflow_run_id: 1,
        html_url: 'https://github.com/owner/repo/actions/runs/1',
      }),
    });
    const body = await (await handleJobs(req(), ENV, f)).json();
    expect(body.runUrl).toBe('https://github.com/owner/repo/actions/runs/1');
  });

  it('releases its own claim and 502s when GitHub refuses', async () => {
    const f = stub({ github: new Response('{}', { status: 403 }) });
    const resp = await handleJobs(req(), ENV, f);
    expect(resp.status).toBe(502);
    const release = f.mock.calls.find(([u]) =>
      String(u).endsWith('/rpc/release_job_trigger'),
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(release[1].body as string)).toEqual({
      p_job: 'fetch_nav',
      p_at: CLAIMED.claimed_at,
    });
  });

  it('releases and 502s when the GitHub request throws', async () => {
    const f = stub({ github: new Error('timeout') });
    const resp = await handleJobs(req(), ENV, f);
    expect(resp.status).toBe(502);
    expect(calledUrls(f).some((u) => u.endsWith('/rpc/release_job_trigger'))).toBe(true);
  });

  it('502s when the claim call fails', async () => {
    const f = stub({ claim: jsonResponse(500, {}) });
    expect((await handleJobs(req(), ENV, f)).status).toBe(502);
  });
});

describe('retryAfterSeconds', () => {
  it('rounds up and never goes below one second', () => {
    const now = Date.parse('2026-11-05T10:00:00Z');
    expect(retryAfterSeconds('2026-11-05T10:00:00.400Z', now)).toBe(1);
    expect(retryAfterSeconds('2026-11-05T09:00:00Z', now)).toBe(1);
    expect(retryAfterSeconds('2026-11-05T10:10:00Z', now)).toBe(600);
    expect(retryAfterSeconds('not a date', now)).toBe(60);
  });
});
