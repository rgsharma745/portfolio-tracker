import { priceQuotes, stockTotals, toInr, usdInrRate, valueStockHolding } from './stocks';

const TODAY = '2026-11-04';
const RATE = 85;

const prices = priceQuotes([
  { market: 'IN', symbol: 'INFY', close: 1500, price_date: '2026-11-04', prev_close: 1480 },
  { market: 'US', symbol: 'CIEN', close: 60, price_date: '2026-11-03', prev_close: 62 },
  { market: 'IN', symbol: 'TCS', close: 4000, price_date: '2026-10-25', prev_close: null },
]);

const indian = (portfolio_id: string, symbol: string, quantity: number, invested: number) => ({
  portfolio_id,
  market: 'IN',
  symbol,
  currency: 'INR',
  quantity,
  invested,
});
const us = (portfolio_id: string, symbol: string, quantity: number, invested: number) => ({
  portfolio_id,
  market: 'US',
  symbol,
  currency: 'USD',
  quantity,
  invested,
});

describe('usdInrRate and toInr', () => {
  it('reads the USDINR pair', () => {
    const rows = [
      { pair: 'EURINR', rate: 90, rate_date: TODAY, prev_rate: null },
      { pair: 'USDINR', rate: RATE, rate_date: TODAY, prev_rate: 84 },
    ];
    expect(usdInrRate(rows)).toBe(RATE);
    expect(usdInrRate([])).toBeNull();
  });

  it('converts USD and passes INR through', () => {
    expect(toInr(10, 'USD', RATE)).toBe(850);
    expect(toInr(10, 'INR', null)).toBe(10);
    expect(toInr(10, 'USD', null)).toBeNull();
  });
});

describe('valueStockHolding', () => {
  it('values an Indian stock in INR', () => {
    const v = valueStockHolding(indian('me', 'INFY', 10, 14000), prices, RATE, TODAY);
    expect(v.currency).toBe('INR');
    expect(v.native).toMatchObject({ value: 15000, pl: 1000, dayChange: 200 });
    expect(v.inr).toBe(v.native);
  });

  it('values a US stock in USD and converts it to INR', () => {
    const v = valueStockHolding(us('me', 'CIEN', 10, 700), prices, RATE, TODAY);
    expect(v.native).toMatchObject({ value: 600, pl: -100, dayChange: -20, price: 60 });
    expect(v.inr).toMatchObject({
      value: 51000,
      invested: 59500,
      pl: -8500,
      dayChange: -1700,
      price: 5100,
    });
    expect(v.inr.plPercent).toBeCloseTo(-14.2857, 3);
  });

  it('cannot show INR for a US stock without an exchange rate', () => {
    const v = valueStockHolding(us('me', 'CIEN', 10, 700), prices, null, TODAY);
    expect(v.native.value).toBe(600);
    expect(v.inr.value).toBeNull();
  });

  it('flags a stale price', () => {
    expect(valueStockHolding(indian('me', 'TCS', 1, 1), prices, RATE, TODAY).native.stale).toBe(
      true,
    );
  });
});

describe('stockTotals', () => {
  const holdings = [
    indian('me', 'INFY', 10, 14000), // 15,000; day +200
    us('me', 'CIEN', 10, 700), // $600 = 51,000; day -$20 = -1,700
    indian('wife', 'INFY', 2, 3200), // 3,000; day +40
    indian('wife', 'NOPRICE', 5, 500),
    us('old', 'CIEN', 100, 1),
  ];

  it('totals both markets in INR across portfolios', () => {
    expect(stockTotals(holdings, prices, RATE, ['me', 'wife'], TODAY)).toMatchObject({
      value: 69000,
      invested: 76700,
      pl: -7700,
      dayChange: -1460,
      count: 4,
      unpriced: 1,
      unpricedInvested: 500,
    });
  });

  it('totals one market of one portfolio', () => {
    expect(stockTotals(holdings, prices, RATE, ['me'], TODAY, { market: 'IN' })).toMatchObject({
      value: 15000,
      count: 1,
    });
  });

  it('totals US stocks in USD', () => {
    expect(
      stockTotals(holdings, prices, RATE, ['me', 'wife'], TODAY, {
        market: 'US',
        currency: 'USD',
      }),
    ).toMatchObject({ value: 600, invested: 700, pl: -100, dayChange: -20 });
  });

  it('converts INR stocks when totals are in USD', () => {
    const totals = stockTotals(holdings, prices, RATE, ['me'], TODAY, { currency: 'USD' });
    expect(totals.value).toBeCloseTo(600 + 15000 / RATE);
  });

  it('counts US stocks as unpriced in INR without an exchange rate', () => {
    expect(stockTotals(holdings, prices, null, ['me'], TODAY)).toMatchObject({
      value: 15000,
      unpriced: 1,
      unpricedInvested: 700,
    });
    expect(stockTotals(holdings, prices, null, ['me'], TODAY, { currency: 'USD' })).toMatchObject({
      value: 600,
      unpriced: 1,
    });
  });
});
