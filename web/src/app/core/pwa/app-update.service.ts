import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** While the app is on screen, ask the server for a new deploy this often. */
export const UPDATE_CHECK_MS = 30 * 60_000;

/**
 * New deploys: the service worker downloads the new version in the background; this offers
 * a reload once it is ready. Created at startup (app.config) so it never misses the
 * "ready" message, and it checks at startup, on returning to the app, and every 30 minutes
 * while visible (the service worker by itself only checks when the app is opened).
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);

  readonly ready = signal(false);

  constructor() {
    if (!this.updates.isEnabled) return;
    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.ready.set(true);
    });
    // The cached version can no longer be served (e.g. files were removed): start fresh.
    this.updates.unrecoverable.subscribe(() => this.document.location.reload());

    const visible = () => this.document.visibilityState === 'visible';
    void this.check();
    this.document.addEventListener('visibilitychange', () => {
      if (visible()) void this.check();
    });
    this.document.defaultView?.setInterval(() => {
      if (visible()) void this.check();
    }, UPDATE_CHECK_MS);
  }

  reload(): void {
    this.document.location.reload();
  }

  private async check(): Promise<void> {
    try {
      // True also when a new version was downloaded earlier but this page still runs the old one.
      if (await this.updates.checkForUpdate()) this.ready.set(true);
    } catch {
      // Offline, not yet registered, or the check failed; the next trigger tries again.
    }
  }
}
