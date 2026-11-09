import {
  convertValuation,
  dayChangePercent,
  daysBetween,
  daysInMonth,
  inPortfolios,
  isStale,
  localIsoDate,
  plPercent,
  scopeIds,
  sumValuations,
  valueHolding,
} from './common';

const TODAY = '2026-11-04';

describe('valueHolding', () => {
  it('values units at the price, with P&L and day change', () => {
    const v = valueHolding(10, 1000, { price: 120, date: TODAY, prevPrice: 115 }, TODAY);
    expect(v.value).toBe(1200);
    expect(v.pl).toBe(200);
    expect(v.plPercent).toBe(20);
    expect(v.dayChange).toBe(50);
    expect(v.stale).toBe(false);
  });

  it('has a day change of 0 when there is no previous price', () => {
    const v = valueHolding(10, 1000, { price: 120, date: TODAY, prevPrice: null }, TODAY);
    expect(v.dayChange).toBe(0);
  });

  it('leaves money fields empty without a price', () => {
    expect(valueHolding(10, 1000, undefined, TODAY)).toMatchObject({
      invested: 1000,
      value: null,
      pl: null,
      dayChange: null,
      stale: false,
    });
  });
});

describe('plPercent', () => {
  it('is 0 when nothing was invested', () => {
    expect(plPercent(500, 0)).toBe(0);
  });
});

describe('convertValuation', () => {
  it('multiplies money fields and keeps the rest', () => {
    const v = valueHolding(2, 100, { price: 60, date: TODAY, prevPrice: 55 }, TODAY);
    expect(convertValuation(v, 80)).toMatchObject({
      invested: 8000,
      value: 9600,
      pl: 1600,
      plPercent: 20,
      dayChange: 800,
      price: 4800,
    });
    expect(convertValuation(valueHolding(1, 100, undefined, TODAY), 80).value).toBeNull();
  });
});

describe('sumValuations', () => {
  it('adds priced holdings and counts unpriced ones apart', () => {
    const quote = { price: 10, date: TODAY, prevPrice: 9 };
    const totals = sumValuations([
      valueHolding(100, 800, quote, TODAY),
      valueHolding(50, 600, quote, TODAY),
      valueHolding(10, 250, undefined, TODAY),
    ]);
    expect(totals).toEqual({
      value: 1500,
      invested: 1400,
      pl: 100,
      plPercent: (100 / 1400) * 100,
      dayChange: 150,
      count: 3,
      unpriced: 1,
      unpricedInvested: 250,
    });
  });

  it('is all zeros for no holdings', () => {
    expect(sumValuations([])).toMatchObject({ value: 0, pl: 0, plPercent: 0, count: 0 });
  });
});

describe('scopeIds', () => {
  const portfolios = [
    { id: 'me', is_active: true },
    { id: 'wife', is_active: true },
    { id: 'old', is_active: false },
  ];

  it('is every active portfolio for All', () => {
    expect(scopeIds(portfolios, null)).toEqual(['me', 'wife']);
  });

  it('is the selected portfolio', () => {
    expect(scopeIds(portfolios, 'wife')).toEqual(['wife']);
  });

  it('falls back to All for an inactive or unknown selection', () => {
    expect(scopeIds(portfolios, 'old')).toEqual(['me', 'wife']);
    expect(scopeIds(portfolios, 'gone')).toEqual(['me', 'wife']);
  });
});

describe('inPortfolios', () => {
  it('keeps rows of the given portfolios', () => {
    const rows = [{ portfolio_id: 'me' }, { portfolio_id: 'old' }];
    expect(inPortfolios(rows, ['me'])).toEqual([{ portfolio_id: 'me' }]);
  });
});

describe('dates', () => {
  it('counts calendar days across months and years', () => {
    expect(daysBetween('2026-10-30', '2026-11-04')).toBe(5);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-04', '2026-11-01')).toBe(-3);
  });

  it('marks prices older than 4 days as stale', () => {
    expect(isStale('2026-10-31', TODAY)).toBe(false);
    expect(isStale('2026-10-30', TODAY)).toBe(true);
  });

  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('formats a local date', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('dayChangePercent', () => {
  it("is today's move against yesterday's value", () => {
    // 10 shares at 150, previous close 140: +100 today on 1,400 yesterday
    expect(dayChangePercent(1500, 100)).toBeCloseTo(7.142857, 5);
    expect(dayChangePercent(600, -20)).toBeCloseTo(-3.225806, 5);
  });

  it('is null without a value and 0 when yesterday was worth nothing', () => {
    expect(dayChangePercent(null, 5)).toBeNull();
    expect(dayChangePercent(100, null)).toBeNull();
    expect(dayChangePercent(100, 100)).toBe(0);
  });
});
