import { priceQuotes } from '../../core/calc/stocks';
import type { StockHolding } from '../../core/data/holdings.service';
import { emptyStockForm, stockFormFrom, validateStockForm } from './stock-form';
import { buildStockRows } from './stock-rows';

const holding = (over: Partial<StockHolding>): StockHolding => ({
  id: 's1',
  owner_id: 'o',
  portfolio_id: 'me',
  market: 'US',
  symbol: 'SMPL',
  name: 'Sample Corp',
  currency: 'USD',
  quantity: 10,
  avg_price: 70,
  invested: 700,
  created_at: '',
  updated_at: '',
  ...over,
});

const prices = priceQuotes([
  { market: 'US', symbol: 'SMPL', close: 60, price_date: '2026-11-03', prev_close: 62 },
  { market: 'IN', symbol: 'INFY', close: 1500, price_date: '2026-11-04', prev_close: 1480 },
]);
const names = new Map([['me', 'Me']]);
const holdings = [
  holding({}),
  holding({
    id: 's2',
    market: 'IN',
    symbol: 'INFY',
    currency: 'INR',
    avg_price: 1400,
    invested: 14000,
  }),
];

describe('buildStockRows', () => {
  it('shows one market, US in USD with the INR value alongside', () => {
    const rows = buildStockRows(holdings, prices, 85, names, ['me'], '2026-11-04', 'US', false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: 'USD',
      value: 600,
      valueInr: 51000,
      pl: -100,
      avgPrice: 70,
      portfolio: 'Me',
    });
  });

  it('converts everything to INR with the toggle', () => {
    const [row] = buildStockRows(holdings, prices, 85, names, ['me'], '2026-11-04', 'US', true);
    expect(row).toMatchObject({ currency: 'INR', value: 51000, invested: 59500, avgPrice: 5950 });
  });

  it('has no INR values without an exchange rate', () => {
    const [row] = buildStockRows(holdings, prices, null, names, ['me'], '2026-11-04', 'US', true);
    expect(row.value).toBeNull();
    expect(row.avgPrice).toBeNull();
  });

  it('keeps Indian stocks in INR', () => {
    const [row] = buildStockRows(holdings, prices, 85, names, ['me'], '2026-11-04', 'IN', false);
    expect(row).toMatchObject({ symbol: 'INFY', currency: 'INR', value: 15000 });
  });
});

describe('validateStockForm', () => {
  const base = { ...emptyStockForm('me', 'IN'), symbol: ' infy ', quantity: '10' };

  it('derives the average price from the amount invested', () => {
    expect(validateStockForm({ ...base, invested: '14,000' }).value).toEqual({
      portfolio_id: 'me',
      market: 'IN',
      currency: 'INR',
      symbol: 'INFY',
      name: null,
      quantity: 10,
      invested: 14000,
      avg_price: 1400,
    });
  });

  it('derives the amount invested from the average price, in USD for US stocks', () => {
    const { value } = validateStockForm({
      ...base,
      market: 'US',
      symbol: 'aapl',
      avgPrice: '150.5',
    });
    expect(value).toMatchObject({ currency: 'USD', invested: 1505, avg_price: 150.5 });
  });

  it('leaves the average price empty for zero quantity', () => {
    const { value } = validateStockForm({ ...base, quantity: '0', invested: '500' });
    expect(value?.avg_price).toBeNull();
  });

  it('needs the invested amount or the average price, and a valid symbol', () => {
    expect(validateStockForm(base).errors.invested).toBe(
      'Enter the amount invested or the average price.',
    );
    expect(validateStockForm({ ...base, symbol: 'bad symbol!', invested: '1' }).errors.symbol).toBe(
      'Use the exchange symbol, e.g. RELIANCE or AAPL.',
    );
    expect(
      validateStockForm({ ...base, portfolioId: '', symbol: '', quantity: 'x', avgPrice: '-1' })
        .errors,
    ).toEqual({
      portfolioId: 'Choose a portfolio.',
      symbol: 'Enter the symbol.',
      quantity: 'Enter a number, e.g. 1250.50.',
      avgPrice: 'Must be zero or more.',
    });
  });

  it('round-trips a saved holding', () => {
    expect(validateStockForm(stockFormFrom(holding({}))).value).toMatchObject({
      symbol: 'SMPL',
      market: 'US',
      invested: 700,
      avg_price: 70,
    });
  });
});
