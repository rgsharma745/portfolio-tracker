import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { JobName } from './market.service';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

/** Jobs the website may run (the Worker's allowlist, worker/jobs.ts). */
export const TRIGGERABLE_JOBS = ['fetch_nav', 'fetch_prices'] as const satisfies readonly JobName[];
export type TriggerableJob = (typeof TRIGGERABLE_JOBS)[number];

/** Matches claim_job_trigger in supabase/migrations/0002_job_triggers.sql. */
export const COOLDOWN_MS = 30 * 60_000;
/** After a successful start, re-query job runs once the job has had time to finish. */
export const RECHECK_AFTER_MS = 2 * 60_000;

export interface TriggerNotice {
  kind: 'success' | 'info' | 'error';
  text: string;
  runUrl?: string;
}

export function isTriggerable(job: string): job is TriggerableJob {
  return (TRIGGERABLE_JOBS as readonly string[]).includes(job);
}

/** When a job triggered at `triggeredAt` may run again, or null if it already may. */
export function nextAllowedFrom(triggeredAt: string, now = Date.now()): string | null {
  const next = Date.parse(triggeredAt) + COOLDOWN_MS;
  return Number.isFinite(next) && next > now ? new Date(next).toISOString() : null;
}

interface WorkerBody {
  status?: string;
  message?: string;
  nextAllowedAt?: string;
  runUrl?: string;
}

/** What to show for the Worker's answer to POST /api/jobs/:job. */
export function describeTriggerResponse(
  httpStatus: number,
  body: WorkerBody,
): { notice: TriggerNotice; nextAllowedAt: string | null } {
  const next = typeof body.nextAllowedAt === 'string' ? body.nextAllowedAt : null;
  if (httpStatus === 202 && body.status === 'triggered') {
    return {
      notice: {
        kind: 'success',
        text: 'Started. The result shows here in a minute or two.',
        ...(body.runUrl ? { runUrl: body.runUrl } : {}),
      },
      nextAllowedAt: next,
    };
  }
  if (httpStatus === 429 && body.status === 'cooldown') {
    return {
      notice: { kind: 'info', text: 'Already run in the last 30 minutes.' },
      nextAllowedAt: next,
    };
  }
  if (httpStatus === 401) {
    return {
      notice: { kind: 'error', text: 'Sign in again to run the job.' },
      nextAllowedAt: null,
    };
  }
  const text =
    typeof body.message === 'string' && body.message ? body.message : 'Could not start the job.';
  return { notice: { kind: 'error', text }, nextAllowedAt: null };
}

/**
 * "Run now" for the NAV and price jobs. The Cloudflare Worker at /api/jobs/:job checks the
 * sign-in, takes a 30-minute lock in `job_triggers` and dispatches the GitHub workflow
 * (docs/ARCHITECTURE.md). This service shows when each job may run again.
 */
@Injectable({ providedIn: 'root' })
export class JobTriggerService implements OnDestroy {
  private readonly supabase = inject(SUPABASE);
  private readonly refresher = inject(RefreshService);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly unlockTimers = new Map<TriggerableJob, ReturnType<typeof setTimeout>>();

  /** ISO time each job may run again; absent when it may run now. */
  readonly nextAllowedAt = signal<Partial<Record<TriggerableJob, string>>>({});
  readonly pending = signal<TriggerableJob | null>(null);
  readonly notices = signal<Partial<Record<TriggerableJob, TriggerNotice>>>({});

  /**
   * Reads the locks, so a job run from another device shows as locked here too. Keeps the later
   * of the stored lock and the one this page already holds: the read may have started before
   * "Run now" answered, and a lock only ends by running out (the unlock timer handles that).
   */
  async load(): Promise<void> {
    const { data, error } = await this.supabase.from('job_triggers').select('job, triggered_at');
    if (error || !data) return;
    for (const job of TRIGGERABLE_JOBS) {
      const row = data.find((r) => r.job === job);
      const stored = row ? nextAllowedFrom(row.triggered_at) : null;
      this.setNextAllowed(job, laterOf(stored, this.nextAllowedAt()[job] ?? null));
    }
  }

  async run(job: TriggerableJob): Promise<void> {
    if (this.pending()) return;
    this.pending.set(job);
    this.setNotice(job, undefined);
    try {
      const { data } = await this.supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        this.setNotice(job, { kind: 'error', text: 'Sign in again to run the job.' });
        return;
      }
      const resp = await fetch(`/api/jobs/${job}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await readBody(resp);
      const { notice, nextAllowedAt } = describeTriggerResponse(resp.status, body);
      this.setNotice(job, notice);
      if (nextAllowedAt) this.setNextAllowed(job, nextAllowedAt);
      if (notice.kind === 'success') this.later(() => this.refresher.refresh(), RECHECK_AFTER_MS);
    } catch {
      this.setNotice(job, { kind: 'error', text: 'Could not reach the server. Try again.' });
    } finally {
      this.pending.set(null);
    }
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.unlockTimers.forEach(clearTimeout);
  }

  /** Sets the lock and clears it again when it runs out, so the button re-enables itself. */
  private setNextAllowed(job: TriggerableJob, at: string | null): void {
    const old = this.unlockTimers.get(job);
    if (old) clearTimeout(old);
    this.unlockTimers.delete(job);
    const wait = at ? Date.parse(at) - Date.now() : 0;
    if (!at || !(wait > 0)) {
      this.nextAllowedAt.update((all) => without(all, job));
      return;
    }
    this.nextAllowedAt.update((all) => ({ ...all, [job]: at }));
    this.unlockTimers.set(
      job,
      setTimeout(() => this.setNextAllowed(job, null), wait),
    );
  }

  private setNotice(job: TriggerableJob, notice: TriggerNotice | undefined): void {
    this.notices.update((all) => (notice ? { ...all, [job]: notice } : without(all, job)));
  }

  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}

async function readBody(resp: Response): Promise<WorkerBody> {
  try {
    const body: unknown = await resp.json();
    return body && typeof body === 'object' ? (body as WorkerBody) : {};
  } catch {
    return {};
  }
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function without<T extends object>(obj: T, key: keyof T): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}
