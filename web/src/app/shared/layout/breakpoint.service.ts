import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/** Breakpoints from AGENTS.md. Layout visibility uses CSS media queries; this is for behaviour. */
export const TABLET_MIN = 768;
export const DESKTOP_MIN = 1024;

@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly width = signal(this.view?.innerWidth ?? DESKTOP_MIN);

  readonly isMobile = computed(() => this.width() < TABLET_MIN);
  readonly isTablet = computed(() => this.width() >= TABLET_MIN && this.width() < DESKTOP_MIN);
  readonly isDesktop = computed(() => this.width() >= DESKTOP_MIN);

  constructor() {
    this.view?.addEventListener('resize', () => this.width.set(this.view?.innerWidth ?? 0), {
      passive: true,
    });
  }
}
