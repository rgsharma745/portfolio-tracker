import {
  DividendInput,
  dividendMarket,
  dividendSymbolKey,
  dividendTotals,
  dividendsByFinancialYear,
  dividendsBySymbol,
} from './dividends';

const indian = (overrides: Partial<DividendInput> = {}): DividendInput => ({
  portfolio_id: 'p1',
  market: 'IN',
  symbol: 'ITC',
  paid_on: '2025-06-11',
  amount_inr: 1000,
  amount_usd: null,
  ...overrides,
});

const us = (overrides: Partial<DividendInput> = {}): DividendInput =>
  indian({ market: 'US', symbol: 'MSFT', amount_inr: 8300, amount_usd: 100, ...overrides });

describe('dividendsByFinancialYear', () => {
  it('groups by April-to-March year, newest first, splitting India and US', () => {
    const rows = [
      indian(),
      indian({ paid_on: '2026-03-31', amount_inr: 500 }), // still FY 2025–26
      us({ paid_on: '2025-12-10' }),
      us({ paid_on: '2026-04-01', amount_inr: 4200, amount_usd: 50 }), // FY 2026–27
    ];
    expect(dividendsByFinancialYear(rows, ['p1'])).toEqual([
      {
        fyStart: 2026,
        label: 'FY 2026–27',
        india: 0,
        us: 4200,
        usd: 50,
        total: 4200,
        count: 1,
      },
      {
        fyStart: 2025,
        label: 'FY 2025–26',
        india: 1500,
        us: 8300,
        usd: 100,
        total: 9800,
        count: 3,
      },
    ]);
  });

  it('only counts the portfolios in scope, and is empty without rows', () => {
    expect(dividendsByFinancialYear([indian({ portfolio_id: 'p2' })], ['p1'])).toEqual([]);
    expect(dividendsByFinancialYear([], ['p1'])).toEqual([]);
  });
});

describe('dividendsBySymbol', () => {
  const rows = [
    indian(),
    indian({ paid_on: '2025-09-01', amount_inr: 250 }),
    indian({ symbol: 'TCS', amount_inr: 3000, paid_on: '2026-04-20' }),
    us(),
    us({ paid_on: '2026-02-10', amount_inr: 8400, amount_usd: 100 }),
  ];

  it('totals each symbol in one year, largest first, with the latest payment', () => {
    expect(dividendsBySymbol(rows, ['p1'], 2025)).toEqual([
      {
        key: 'US:MSFT',
        market: 'US',
        symbol: 'MSFT',
        inr: 16_700,
        usd: 200,
        count: 2,
        lastPaid: '2026-02-10',
      },
      {
        key: 'IN:ITC',
        market: 'IN',
        symbol: 'ITC',
        inr: 1250,
        usd: null,
        count: 2,
        lastPaid: '2025-09-01',
      },
    ]);
  });

  it('covers every year when no year is given', () => {
    expect(dividendsBySymbol(rows, ['p1'], null).map((s) => s.key)).toEqual([
      'US:MSFT',
      'IN:TCS',
      'IN:ITC',
    ]);
  });

  it('keeps the same ticker in two markets apart and breaks ties by symbol', () => {
    const tied = [
      indian({ symbol: 'B' }),
      indian({ symbol: 'A' }),
      us({ symbol: 'A', amount_inr: 1000 }),
    ];
    expect(dividendsBySymbol(tied, ['p1'], null).map((s) => s.key)).toEqual([
      'IN:A',
      'US:A',
      'IN:B',
    ]);
  });
});

describe('dividendTotals', () => {
  it('adds this FY, last FY and all time in rupees', () => {
    const rows = [
      indian({ paid_on: '2026-04-01', amount_inr: 100 }),
      us({ paid_on: '2026-11-01', amount_inr: 900 }),
      indian({ paid_on: '2026-03-31', amount_inr: 50 }),
      indian({ paid_on: '2023-05-01', amount_inr: 7 }),
      indian({ portfolio_id: 'p2', amount_inr: 1_000_000 }),
    ];
    expect(dividendTotals(rows, ['p1'], '2026-11-10')).toEqual({
      thisYear: 1000,
      lastYear: 50,
      allTime: 1057,
    });
  });
});

describe('dividendSymbolKey and dividendMarket', () => {
  it('reads anything but US as an Indian market', () => {
    expect(dividendMarket('US')).toBe('US');
    expect(dividendMarket('IN')).toBe('IN');
    expect(dividendMarket('')).toBe('IN');
    expect(dividendSymbolKey({ market: 'US', symbol: 'MSFT' })).toBe('US:MSFT');
  });
});
