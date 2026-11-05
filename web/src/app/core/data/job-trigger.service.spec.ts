import { TestBed } from '@angular/core/testing';
import {
  COOLDOWN_MS,
  JobTriggerService,
  RECHECK_AFTER_MS,
  describeTriggerResponse,
  isTriggerable,
  nextAllowedFrom,
} from './job-trigger.service';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

const NOW = Date.parse('2026-11-05T10:00:00Z');
const IN_10_MIN = '2026-11-05T10:10:00.000Z';

function fakeSupabase(rows: { job: string; triggered_at: string }[], token: string | null = 'tok') {
  return {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: token ? { access_token: token } : null } }),
    },
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  };
}

function setup(rows: { job: string; triggered_at: string }[] = [], token: string | null = 'tok') {
  const refresh = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: fakeSupabase(rows, token) },
      { provide: RefreshService, useValue: { refresh } },
    ],
  });
  return { service: TestBed.inject(JobTriggerService), refresh };
}

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('job trigger helpers', () => {
  it('knows which jobs the website may run', () => {
    expect(isTriggerable('fetch_nav')).toBe(true);
    expect(isTriggerable('fetch_prices')).toBe(true);
    expect(isTriggerable('backup')).toBe(false);
  });

  it('locks for 30 minutes after a trigger', () => {
    expect(nextAllowedFrom('2026-11-05T09:50:00Z', NOW)).toBe('2026-11-05T10:20:00.000Z');
    expect(nextAllowedFrom('2026-11-05T09:30:00Z', NOW)).toBeNull();
    expect(nextAllowedFrom('garbage', NOW)).toBeNull();
    expect(COOLDOWN_MS).toBe(30 * 60_000);
  });

  it('describes each Worker answer', () => {
    expect(
      describeTriggerResponse(202, {
        status: 'triggered',
        nextAllowedAt: IN_10_MIN,
        runUrl: 'https://github.com/o/r/actions/runs/1',
      }),
    ).toEqual({
      notice: {
        kind: 'success',
        text: 'Started. The result shows here in a minute or two.',
        runUrl: 'https://github.com/o/r/actions/runs/1',
      },
      nextAllowedAt: IN_10_MIN,
    });
    expect(describeTriggerResponse(429, { status: 'cooldown', nextAllowedAt: IN_10_MIN })).toEqual({
      notice: { kind: 'info', text: 'Already run in the last 30 minutes.' },
      nextAllowedAt: IN_10_MIN,
    });
    expect(describeTriggerResponse(401, {}).notice.text).toBe('Sign in again to run the job.');
    expect(
      describeTriggerResponse(502, { message: 'GitHub did not start the job.' }).notice,
    ).toEqual({ kind: 'error', text: 'GitHub did not start the job.' });
    expect(describeTriggerResponse(404, {}).notice.text).toBe('Could not start the job.');
  });
});

describe('JobTriggerService', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads locks that are still running and unlocks when they end', async () => {
    const { service } = setup([
      { job: 'fetch_nav', triggered_at: '2026-11-05T09:40:00Z' },
      { job: 'fetch_prices', triggered_at: '2026-11-05T09:00:00Z' },
    ]);
    await service.load();
    expect(service.nextAllowedAt()).toEqual({ fetch_nav: '2026-11-05T10:10:00.000Z' });

    vi.advanceTimersByTime(10 * 60_000);
    expect(service.nextAllowedAt()).toEqual({});
  });

  it('posts with the session token, then locks and re-checks job runs', async () => {
    const { service, refresh } = setup();
    const fetchMock = respond(202, { status: 'triggered', nextAllowedAt: IN_10_MIN });

    await service.run('fetch_nav');

    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/fetch_nav', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });
    expect(service.nextAllowedAt()['fetch_nav']).toBe(IN_10_MIN);
    expect(service.notices()['fetch_nav']?.kind).toBe('success');
    expect(service.pending()).toBeNull();

    vi.advanceTimersByTime(RECHECK_AFTER_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the lock time when the Worker says it is cooling down', async () => {
    const { service, refresh } = setup();
    respond(429, { status: 'cooldown', nextAllowedAt: IN_10_MIN });
    await service.run('fetch_prices');
    expect(service.nextAllowedAt()['fetch_prices']).toBe(IN_10_MIN);
    expect(service.notices()['fetch_prices']?.kind).toBe('info');
    vi.advanceTimersByTime(RECHECK_AFTER_MS);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports errors without locking', async () => {
    const { service } = setup();
    respond(502, { status: 'error', message: 'GitHub did not start the job. Try again.' });
    await service.run('fetch_nav');
    expect(service.nextAllowedAt()).toEqual({});
    expect(service.notices()['fetch_nav']).toEqual({
      kind: 'error',
      text: 'GitHub did not start the job. Try again.',
    });
  });

  it('reports a network failure', async () => {
    const { service } = setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await service.run('fetch_nav');
    expect(service.notices()['fetch_nav']?.text).toBe('Could not reach the server. Try again.');
    expect(service.pending()).toBeNull();
  });

  it('does not call the Worker without a session', async () => {
    const { service } = setup([], null);
    const fetchMock = respond(202, {});
    await service.run('fetch_nav');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.notices()['fetch_nav']?.kind).toBe('error');
  });
});
