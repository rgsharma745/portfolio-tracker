import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService, UPDATE_CHECK_MS } from './app-update.service';

function setup({ enabled = true, newVersion = false, checkFails = false } = {}) {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<unknown>();
  const checkForUpdate = checkFails
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue(newVersion);
  const listeners: Record<string, () => void> = {};
  let tick: () => void = () => undefined;
  const doc = {
    visibilityState: 'visible',
    location: { reload: vi.fn() },
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    defaultView: { setInterval: (fn: () => void, ms: number) => ((tick = fn), ms) },
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SwUpdate,
        useValue: { isEnabled: enabled, versionUpdates, unrecoverable, checkForUpdate },
      },
      { provide: DOCUMENT, useValue: doc },
    ],
  });
  const service = TestBed.inject(AppUpdateService);
  return {
    service,
    doc,
    versionUpdates,
    unrecoverable,
    checkForUpdate,
    listeners,
    tick: () => tick(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AppUpdateService', () => {
  it('does nothing without a service worker (dev server, unsupported browser)', () => {
    const { service, checkForUpdate } = setup({ enabled: false });
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(service.ready()).toBe(false);
  });

  it('offers a reload once a new version is ready', () => {
    const { service, versionUpdates } = setup();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(service.ready()).toBe(false);
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
    expect(service.ready()).toBe(true);
  });

  it('checks at startup and is ready when a newer version was already downloaded', async () => {
    const { service, checkForUpdate } = setup({ newVersion: true });
    await settle();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(service.ready()).toBe(true);
  });

  it('checks again on returning to the app and on the timer, only while visible', async () => {
    const { doc, listeners, tick, checkForUpdate } = setup();
    listeners['visibilitychange']();
    tick();
    expect(checkForUpdate).toHaveBeenCalledTimes(3);
    doc.visibilityState = 'hidden';
    listeners['visibilitychange']();
    tick();
    expect(checkForUpdate).toHaveBeenCalledTimes(3);
    expect(UPDATE_CHECK_MS).toBe(30 * 60_000);
  });

  it('ignores a failed check (offline); the next trigger tries again', async () => {
    const { service } = setup({ checkFails: true });
    await settle();
    expect(service.ready()).toBe(false);
  });

  it('reloads when asked, and when the cached version can no longer be served', () => {
    const { service, doc, unrecoverable } = setup();
    service.reload();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });
    expect(doc.location.reload).toHaveBeenCalledTimes(2);
  });
});
