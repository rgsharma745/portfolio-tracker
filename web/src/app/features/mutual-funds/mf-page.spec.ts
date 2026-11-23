import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { navQuotes } from '../../core/calc/mf';
import { HoldingsService, MfHolding } from '../../core/data/holdings.service';
import { MfTransactionsService } from '../../core/data/mf-transactions.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { MfPage } from './mf-page';

const holding = (id: string, portfolio_id: string, code: string | null): MfHolding => ({
  id,
  owner_id: 'o',
  portfolio_id,
  scheme_code: code,
  scheme_name: `Fund ${id}`,
  folio: null,
  units: 10,
  invested: 400,
  created_at: '',
  updated_at: '',
});

function render(mobile: boolean) {
  const mf = signal([holding('a', 'me', '100'), holding('b', 'wife', null)]);
  const navs = signal([{ scheme_code: '100', nav: 50, nav_date: '2026-11-03', prev_nav: 49 }]);
  TestBed.configureTestingModule({
    imports: [MfPage],
    providers: [
      provideRouter([]),
      {
        provide: HoldingsService,
        useValue: {
          mf,
          loaded: signal(true),
          error: signal(null),
          navQuotes: computed(() => navQuotes(navs())),
          saveMf: vi.fn(),
          remove: vi.fn(),
        },
      },
      {
        provide: PortfolioService,
        useValue: {
          portfolios: signal([
            { id: 'me', name: 'Me', is_active: true },
            { id: 'wife', name: 'Wife', is_active: true },
          ]),
          active: signal([
            { id: 'me', name: 'Me', is_active: true },
            { id: 'wife', name: 'Wife', is_active: true },
          ]),
          scope: signal(null),
          scopeIds: signal(['me', 'wife']),
        },
      },
      {
        provide: MfTransactionsService,
        useValue: {
          transactions: signal([]),
          loaded: signal(true),
          loading: signal(false),
          error: signal(null),
          load: vi.fn(),
        },
      },
      { provide: BreakpointService, useValue: { isMobile: signal(mobile) } },
    ],
  });
  const fixture = TestBed.createComponent(MfPage);
  return { fixture, mf, el: fixture.nativeElement as HTMLElement };
}

describe('MfPage', () => {
  for (const mobile of [false, true]) {
    it(`lists funds with tags and totals (${mobile ? 'mobile' : 'desktop'})`, async () => {
      const { fixture, el, mf } = render(mobile);
      await fixture.whenStable();
      expect(el.textContent).toContain('Fund a');
      expect(el.textContent).toContain('No NAV');
      expect(el.textContent).toContain('1 fund has no NAV yet');
      mf.update((rows) => [...rows, holding('c', 'me', '100')]);
      await fixture.whenStable();
      expect(el.textContent).toContain('Fund c');
    });
  }
});
