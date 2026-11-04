import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** Re-query while the app is on screen this often, to pick up job runs and edits made elsewhere. */
export const AUTO_REFRESH_MS = 5 * 60_000;
/** Coming back to the tab or app re-queries when the data is older than this. */
export const STALE_ON_RETURN_MS = 60_000;

/**
 * When data is re-queried: the top bar's Refresh button, returning to the app, and a timer
 * while it is visible. Data services re-query when `tick` changes and call `markUpdated()`
 * once fresh data has arrived.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private readonly document = inject(DOCUMENT);

  readonly tick = signal(0);
  readonly lastUpdated = signal<Date | null>(null);

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
    this.tick.update((n) => n + 1);
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
