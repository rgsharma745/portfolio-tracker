import { Injectable, signal } from '@angular/core';

/**
 * The top bar's Refresh button. Data services re-query when `tick` changes and call
 * `markUpdated()` once fresh data has arrived.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  readonly tick = signal(0);
  readonly lastUpdated = signal<Date | null>(null);

  refresh(): void {
    this.tick.update((n) => n + 1);
  }

  markUpdated(at = new Date()): void {
    this.lastUpdated.set(at);
  }
}
