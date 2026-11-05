import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * New deploys: the service worker downloads the new version in the background; this
 * offers a reload once it is ready, and checks again whenever the app comes back on screen.
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
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') void this.check();
    });
  }

  reload(): void {
    this.document.location.reload();
  }

  private async check(): Promise<void> {
    try {
      await this.updates.checkForUpdate();
    } catch {
      // Offline or the check failed; the next visit tries again.
    }
  }
}
