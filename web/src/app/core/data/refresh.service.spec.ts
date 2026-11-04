import { TestBed } from '@angular/core/testing';
import { AUTO_REFRESH_MS, RefreshService, STALE_ON_RETURN_MS } from './refresh.service';

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
});
