import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/** Re-query while the app is on screen this often, to pick up job runs and edits made elsewhere. */
export const AUTO_REFRESH_MS = 5 * 60_000;
/** Coming back to the tab or app re-queries when the data is older than this. */
export const STALE_ON_RETURN_MS = 60_000;
/** A refresh shows as busy for at least this long, so a fast one is still seen to happen. */
export const MIN_BUSY_MS = 600;

/**
 * When data is re-queried: the top bar's Refresh button, returning to the app, and a timer
 * while it is visible. Data services re-query when `tick` changes and call `markUpdated()`
 * once fresh data has arrived. They pass each load through `track()`, so `busy` is true while
 * any is in flight and the Refresh button can show it.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private readonly document = inject(DOCUMENT);

  readonly tick = signal(0);
  readonly lastUpdated = signal<Date | null>(null);

  private readonly inFlight = signal(0);
  private readonly holding = signal(false);
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** True while a load is running, and for MIN_BUSY_MS after a refresh starts. */
  readonly busy = computed(() => this.inFlight() > 0 || this.holding());

  constructor() {
    const view = this.document.defaultView;
    this.document.addEventListener('visibilitychange', () => {
      if (this.visible() && this.olderThan(STALE_ON_RETURN_MS)) this.refresh();
    });
    view?.setInterval(() => {
      if (this.visible()) this.refresh();
    }, AUTO_REFRESH_MS);
  }

  refresh(): void {
    this.holding.set(true);
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => this.holding.set(false), MIN_BUSY_MS);
    this.tick.update((n) => n + 1);
  }

  /** Counts `load` as in flight until it settles; returns it unchanged. */
  track<T>(load: Promise<T>): Promise<T> {
    this.inFlight.update((n) => n + 1);
    return load.finally(() => this.inFlight.update((n) => n - 1));
  }

  markUpdated(at = new Date()): void {
    this.lastUpdated.set(at);
  }

  private visible(): boolean {
    return this.document.visibilityState === 'visible';
  }

  /** Only once something has loaded: before that the services are still on their first load. */
  private olderThan(ms: number): boolean {
    const last = this.lastUpdated();
    return last !== null && Date.now() - last.getTime() > ms;
  }
}
