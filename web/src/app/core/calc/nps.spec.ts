import { navQuotes } from './mf';
import {
  NpsContributionInput,
  NpsHoldingInput,
  isNpsSchemeClass,
  npsAccountKey,
  npsByAccount,
  npsByFinancialYear,
  npsMixIn,
  npsThisYear,
  npsTotals,
  npsValue,
  npsXirr,
  valueNpsHolding,
} from './nps';
import { xirr } from './xirr';

const TODAY = '2026-11-07';
const navs = navQuotes([
  { scheme_code: 'SM008001', nav: 50, nav_date: '2026-11-06', prev_nav: 49 },
  { scheme_code: 'SM008002', nav: 30, nav_date: '2026-11-06', prev_nav: 30.5 },
  { scheme_code: 'SM008003', nav: 20, nav_date: '2026-10-01', prev_nav: null },
]);

function holding(over: Partial<NpsHoldingInput>): NpsHoldingInput {
  return {
    portfolio_id: 'p-me',
    account: 'Rahul PRAN',
    scheme_class: 'E',
    scheme_code: 'SM008001',
    units: 100,
    units_as_of: '2026-10-31',
    ...over,
  };
}

function contribution(over: Partial<NpsContributionInput>): NpsContributionInput {
  return {
    portfolio_id: 'p-me',
    account: 'Rahul PRAN',
    contribution_date: '2025-04-05',
    contributor: 'self',
    amount: 1000,
    ...over,
  };
}

const holdings = [
  holding({}), // 5,000, day change +100
  holding({ scheme_class: 'C', scheme_code: 'SM008002', units: 50 }), // 1,500, day change -25
  holding({ scheme_class: 'G', scheme_code: 'SM008003', units: 25 }), // 500, stale
  holding({ portfolio_id: 'p-wife', account: 'Wife PRAN', units: 10 }), // 500
  holding({ portfolio_id: 'p-old', account: 'Gone', units: 1000 }),
];

const contributions = [
  contribution({}),
  contribution({ contribution_date: '2025-04-05', contributor: 'employer', amount: 800 }),
  contribution({ contribution_date: '2026-03-31', amount: 1200 }),
  contribution({ contribution_date: '2026-10-05', amount: 1500 }),
  contribution({ contribution_date: '2026-10-05', contributor: 'employer', amount: 900 }),
  contribution({ portfolio_id: 'p-wife', account: 'Wife PRAN', amount: 400 }),
  contribution({ portfolio_id: 'p-old', account: 'Gone', amount: 99999 }),
];

describe('NPS calculations', () => {
  it('values one scheme as units × NAV, with day change and staleness', () => {
    expect(valueNpsHolding(holdings[0], navs, TODAY)).toEqual({
      value: 5000,
      dayChange: 100,
      nav: 50,
      navDate: '2026-11-06',
      stale: false,
    });
    expect(valueNpsHolding(holdings[2], navs, TODAY).stale).toBe(true);
    expect(valueNpsHolding(holding({ scheme_code: null }), navs, TODAY).value).toBeNull();
    expect(valueNpsHolding(holding({ scheme_code: ' SM008001 ' }), navs, TODAY).value).toBe(5000);
  });

  it('totals one portfolio: value, invested split, P&L, day change and XIRR', () => {
    const t = npsTotals(holdings, contributions, navs, ['p-me'], TODAY);
    expect(t.value).toBe(7000);
    expect(t.self).toBe(3700);
    expect(t.employer).toBe(1700);
    expect(t.invested).toBe(5400);
    expect(t.pl).toBe(1600);
    expect(t.plPercent).toBeCloseTo((1600 / 5400) * 100, 9);
    expect(t.dayChange).toBe(75);
    expect(t.unpriced).toBe(0);
    const expected = xirr([
      ...contributions.slice(0, 5).map((c) => ({ date: c.contribution_date, amount: -c.amount })),
      { date: TODAY, amount: 7000 },
    ]);
    expect(t.xirr).toBeCloseTo(expected!, 9);
    expect(t.xirr!).toBeGreaterThan(0);
  });

  it('totals several portfolios, or one account', () => {
    const all = npsTotals(holdings, contributions, navs, ['p-me', 'p-wife'], TODAY);
    expect(all.value).toBe(7500);
    expect(all.invested).toBe(5800);
    const wife = npsTotals(
      holdings,
      contributions,
      navs,
      ['p-me', 'p-wife'],
      TODAY,
      npsAccountKey({ portfolio_id: 'p-wife', account: 'Wife PRAN' }),
    );
    expect(wife.value).toBe(500);
    expect(wife.invested).toBe(400);
    expect(npsValue(holdings, navs, ['p-me', 'p-wife'], TODAY)).toBe(7500);
  });

  it('leaves out a scheme with no NAV and then shows no XIRR', () => {
    const extra = [...holdings, holding({ scheme_class: 'A', scheme_code: 'SM999999', units: 5 })];
    const t = npsTotals(extra, contributions, navs, ['p-me'], TODAY);
    expect(t.value).toBe(7000);
    expect(t.unpriced).toBe(1);
    expect(t.xirr).toBeNull();
    // A scheme with no units left does not count as unpriced
    const sold = [...holdings, holding({ scheme_class: 'A', scheme_code: null, units: 0 })];
    expect(npsTotals(sold, contributions, navs, ['p-me'], TODAY).unpriced).toBe(0);
  });

  it('has no XIRR without contributions or value', () => {
    expect(npsXirr([], 100, 0, TODAY)).toBeNull();
    expect(npsXirr([contribution({})], 0, 0, TODAY)).toBeNull();
    expect(npsTotals([], contributions, navs, ['p-me'], TODAY).xirr).toBeNull();
    const empty = npsTotals([], [], navs, ['p-me'], TODAY);
    expect(empty.invested).toBe(0);
    expect(empty.plPercent).toBe(0);
  });

  it('splits value by scheme class in E, C, G, A order', () => {
    const mix = npsMixIn(holdings, navs, ['p-me'], TODAY);
    expect(mix.map((m) => [m.schemeClass, m.value])).toEqual([
      ['E', 5000],
      ['C', 1500],
      ['G', 500],
    ]);
    expect(mix[0].percent).toBeCloseTo((5000 / 7000) * 100, 9);
    expect(mix[0].label).toBe('Equity');
    expect(npsMixIn([holding({ scheme_class: 'X' })], navs, ['p-me'], TODAY)).toEqual([]);
    expect(isNpsSchemeClass('G')).toBe(true);
    expect(isNpsSchemeClass('Z')).toBe(false);
  });

  it('summarises each account and flags units older than the last contribution', () => {
    const rows = npsByAccount(holdings, contributions, navs, ['p-me', 'p-wife'], TODAY);
    expect(rows.map((r) => r.account)).toEqual(['Rahul PRAN', 'Wife PRAN']);
    const me = rows[0];
    expect(me.value).toBe(7000);
    expect(me.invested).toBe(5400);
    expect(me.mix).toHaveLength(3);
    expect(me.unitsAsOf).toBe('2026-10-31');
    expect(me.lastContribution).toBe('2026-10-05');
    expect(me.unitsBehind).toBe(false);
    expect(rows[1].unitsBehind).toBe(false);

    const late = [...contributions, contribution({ contribution_date: '2026-11-05' })];
    expect(npsByAccount(holdings, late, navs, ['p-me'], TODAY)[0].unitsBehind).toBe(true);
  });

  it('lists an account that has contributions but no units yet', () => {
    const rows = npsByAccount([], [contribution({ account: 'New PRAN' })], navs, ['p-me'], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].unitsAsOf).toBeNull();
    expect(rows[0].unitsBehind).toBe(true);
    expect(rows[0].xirr).toBeNull();
  });

  it('sums contributions per financial year, newest first, with gap years', () => {
    const rows = npsByFinancialYear(
      [...contributions, contribution({ contribution_date: '2023-06-01', amount: 100 })],
      ['p-me'],
    );
    expect(rows.map((r) => r.label)).toEqual([
      'FY 2026–27',
      'FY 2025–26',
      'FY 2024–25',
      'FY 2023–24',
    ]);
    expect(rows[0]).toMatchObject({ self: 1500, employer: 900, total: 2400, cumulative: 5500 });
    // 31 March 2026 belongs to FY 2025-26
    expect(rows[1]).toMatchObject({ self: 2200, employer: 800, total: 3000, cumulative: 3100 });
    expect(rows[2]).toMatchObject({ total: 0, cumulative: 100 });
    expect(npsByFinancialYear([], ['p-me'])).toEqual([]);

    const wife = npsByFinancialYear(
      contributions,
      ['p-me', 'p-wife'],
      npsAccountKey({ portfolio_id: 'p-wife', account: 'Wife PRAN' }),
    );
    expect(wife).toHaveLength(1);
    expect(wife[0].total).toBe(400);
  });

  it("adds up this financial year's contributions", () => {
    expect(npsThisYear(contributions, ['p-me'], TODAY)).toEqual({
      self: 1500,
      employer: 900,
      total: 2400,
    });
    expect(npsThisYear(contributions, ['p-wife'], TODAY).total).toBe(0);
  });
});
