import { mfTotals, navQuotes, valueMfHolding } from './mf';

const TODAY = '2026-11-04';

const navs = navQuotes([
  { scheme_code: '100', nav: 50, nav_date: '2026-11-03', prev_nav: 49 },
  { scheme_code: '200', nav: 20, nav_date: '2026-10-20', prev_nav: 21 },
  { scheme_code: '300', nav: 12.5, nav_date: '2026-11-03', prev_nav: null },
]);

const holding = (
  portfolio_id: string,
  scheme_code: string | null,
  units: number,
  invested: number,
) => ({
  portfolio_id,
  scheme_code,
  units,
  invested,
});

describe('valueMfHolding', () => {
  it('values units at the latest NAV', () => {
    const v = valueMfHolding(holding('me', '100', 100.5, 4000), navs, TODAY);
    expect(v.value).toBeCloseTo(5025);
    expect(v.pl).toBeCloseTo(1025);
    expect(v.plPercent).toBeCloseTo(25.625);
    expect(v.dayChange).toBeCloseTo(100.5);
    expect(v.priceDate).toBe('2026-11-03');
    expect(v.stale).toBe(false);
  });

  it('shows a negative P&L and day change for a falling fund', () => {
    const v = valueMfHolding(holding('me', '200', 100, 2500), navs, TODAY);
    expect(v.pl).toBe(-500);
    expect(v.plPercent).toBe(-20);
    expect(v.dayChange).toBe(-100);
  });

  it('flags a stale NAV date', () => {
    expect(valueMfHolding(holding('me', '200', 1, 1), navs, TODAY).stale).toBe(true);
  });

  it('has no day change for a brand-new fund (no previous NAV)', () => {
    expect(valueMfHolding(holding('me', '300', 10, 100), navs, TODAY).dayChange).toBe(0);
  });

  it('cannot value a fund without a NAV or without a code', () => {
    expect(valueMfHolding(holding('me', '999', 10, 100), navs, TODAY).value).toBeNull();
    expect(valueMfHolding(holding('me', null, 10, 100), navs, TODAY).value).toBeNull();
  });

  it('trims the scheme code', () => {
    expect(valueMfHolding(holding('me', ' 100 ', 1, 0), navs, TODAY).value).toBe(50);
  });

  it('values zero units at 0, so everything invested shows as a loss', () => {
    const v = valueMfHolding(holding('me', '100', 0, 1000), navs, TODAY);
    expect(v.value).toBe(0);
    expect(v.pl).toBe(-1000);
    expect(v.dayChange).toBe(0);
  });
});

describe('mfTotals', () => {
  const holdings = [
    holding('me', '100', 10, 400), // 500, day +10
    holding('me', '999', 5, 300), // no NAV
    holding('wife', '100', 20, 900), // 1000, day +20
    holding('wife', '200', 10, 250), // 200, day -10
    holding('old', '100', 1000, 1), // inactive portfolio
  ];

  it('totals one portfolio', () => {
    expect(mfTotals(holdings, navs, ['wife'], TODAY)).toMatchObject({
      value: 1200,
      invested: 1150,
      pl: 50,
      dayChange: 10,
      count: 2,
      unpriced: 0,
    });
  });

  it('totals several portfolios and leaves out unpriced funds', () => {
    const totals = mfTotals(holdings, navs, ['me', 'wife'], TODAY);
    expect(totals).toMatchObject({
      value: 1700,
      invested: 1550,
      pl: 150,
      dayChange: 20,
      count: 4,
      unpriced: 1,
      unpricedInvested: 300,
    });
    expect(totals.plPercent).toBeCloseTo((150 / 1550) * 100);
  });

  it('is empty for no portfolios', () => {
    expect(mfTotals(holdings, navs, [], TODAY).count).toBe(0);
  });
});
