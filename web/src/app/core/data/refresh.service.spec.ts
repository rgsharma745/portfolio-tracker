import { TestBed } from '@angular/core/testing';
import {
  AUTO_REFRESH_MS,
  MIN_BUSY_MS,
  RefreshService,
  STALE_ON_RETURN_MS,
} from './refresh.service';

describe('RefreshService', () => {
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setVisibility(state: DocumentVisibilityState) {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('re-queries on a timer only while the app is visible', () => {
    const service = TestBed.inject(RefreshService);
    vi.advanceTimersByTime(AUTO_REFRESH_MS);
    expect(service.tick()).toBe(1);

    visibility = 'hidden';
    vi.advanceTimersByTime(AUTO_REFRESH_MS);
    expect(service.tick()).toBe(1);
  });

  it('re-queries on return when the data is stale', () => {
    const service = TestBed.inject(RefreshService);
    service.markUpdated(new Date(Date.now() - STALE_ON_RETURN_MS - 1));

    setVisibility('hidden');
    expect(service.tick()).toBe(0);
    setVisibility('visible');
    expect(service.tick()).toBe(1);
  });

  it('does not re-query on return when the data is fresh or still loading', () => {
    const service = TestBed.inject(RefreshService);
    setVisibility('visible');
    expect(service.tick()).toBe(0);

    service.markUpdated();
    setVisibility('visible');
    expect(service.tick()).toBe(0);
  });

  it('is busy while a tracked load runs', async () => {
    const service = TestBed.inject(RefreshService);
    let finish!: () => void;
    const load = service.track(new Promise<void>((resolve) => (finish = resolve)));
    expect(service.busy()).toBe(true);
    finish();
    await load;
    expect(service.busy()).toBe(false);
  });

  it('stops being busy when a load fails', async () => {
    const service = TestBed.inject(RefreshService);
    await expect(service.track(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(service.busy()).toBe(false);
  });

  it('shows a refresh as busy for a minimum time even when loads are instant', () => {
    const service = TestBed.inject(RefreshService);
    service.refresh();
    expect(service.busy()).toBe(true);
    vi.advanceTimersByTime(MIN_BUSY_MS - 1);
    expect(service.busy()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(service.busy()).toBe(false);
  });

  it('stays busy past the minimum while a load is still running', async () => {
    const service = TestBed.inject(RefreshService);
    let finish!: () => void;
    service.refresh();
    const load = service.track(new Promise<void>((resolve) => (finish = resolve)));
    vi.advanceTimersByTime(MIN_BUSY_MS * 5);
    expect(service.busy()).toBe(true);
    finish();
    await load;
    expect(service.busy()).toBe(false);
  });
});
