import { describe, expect, it, vi } from 'vitest';
import { JobsEnv } from './jobs';
import { SCHEDULES, handleScheduled } from './schedule';
import wrangler from '../wrangler.jsonc?raw';

const ENV: JobsEnv = { GITHUB_REPO: 'owner/repo', GITHUB_TOKEN: 'gh-token' };

function github(answer: Response | Error = new Response(null, { status: 204 })) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    if (!String(input).startsWith('https://api.github.com/'))
      throw new Error(`unexpected ${input}`);
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

/** The `triggers.crons` list in wrangler.jsonc. */
function wranglerCrons(): string[] {
  const list = /"crons"\s*:\s*\[([^\]]*)\]/.exec(wrangler)?.[1] ?? '';
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** "M H * * DOW" in UTC to the IST time of day, e.g. "7 18 * * *" → "23:37". */
function istTime(cron: string): string {
  const [minute, hour] = cron.split(' ').map(Number);
  const total = (hour * 60 + minute + 330) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

describe('SCHEDULES', () => {
  it('matches the Cron Triggers in wrangler.jsonc, within the free limit of 5', () => {
    expect(wranglerCrons().sort()).toEqual(Object.keys(SCHEDULES).sort());
    expect(wranglerCrons().length).toBeLessThanOrEqual(5);
  });

  it('runs at the IST times the workflows document', () => {
    const byJob = (job: string) =>
      Object.entries(SCHEDULES)
        .filter(([, j]) => j === job)
        .map(([cron]) => istTime(cron))
        .sort();
    expect(byJob('fetch_nav')).toEqual(['08:17', '23:37']);
    expect(byJob('fetch_prices')).toEqual(['04:23', '19:13']);
  });
});

describe('handleScheduled', () => {
  it('starts the workflow for the cron on main', async () => {
    const f = github();
    await expect(handleScheduled('47 2 * * *', ENV, f)).resolves.toBe('nav.yml');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/owner/repo/actions/workflows/nav.yml/dispatches',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' });
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer gh-token');
    await expect(handleScheduled('53 22 * * MON-FRI', ENV, github())).resolves.toBe('prices.yml');
  });

  it('fails loudly on an unknown cron, missing settings or a refused dispatch', async () => {
    const f = github();
    await expect(handleScheduled('0 0 * * *', ENV, f)).rejects.toThrow('no job for cron');
    await expect(handleScheduled('7 18 * * *', {}, f)).rejects.toThrow('not set');
    expect(f).not.toHaveBeenCalled();
    await expect(
      handleScheduled('7 18 * * *', ENV, github(new Response('no', { status: 403 }))),
    ).rejects.toThrow('GitHub did not start nav.yml');
    await expect(handleScheduled('7 18 * * *', ENV, github(new Error('network')))).rejects.toThrow(
      'GitHub did not start nav.yml',
    );
  });
});
