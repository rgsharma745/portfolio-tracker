import { rsuTotals, rsuUnits, valueRsuGrant } from './rsu';
import { priceQuotes } from './stocks';

const RATE = 85;
const prices = priceQuotes([
  { symbol: 'CIEN', close: 60, price_date: '2026-11-03', prev_close: 62 },
]);

const grant = (
  portfolio_id: string,
  units_granted: number,
  units_vested: number,
  units_sold_for_tax: number,
  symbol = 'CIEN',
) => ({ portfolio_id, symbol, units_granted, units_vested, units_sold_for_tax, tax_rate: 0.3 });

describe('rsuUnits', () => {
  it('derives sellable and pending units for a partly vested grant', () => {
    expect(rsuUnits(grant('me', 100, 40, 12))).toEqual({
      granted: 100,
      vested: 40,
      soldForTax: 12,
      sellable: 28,
      pending: 60,
    });
  });
});

describe('valueRsuGrant', () => {
  it('values a partly vested grant in USD and INR', () => {
    const v = valueRsuGrant(grant('me', 100, 40, 12), prices, RATE);
    expect(v.price).toBe(60);
    expect(v.totalUsd).toBe(6000);
    expect(v.afterTaxUsd).toBeCloseTo(4200);
    expect(v.afterTaxInr).toBeCloseTo(357000);
    expect(v.vestedUsd).toBe(2400);
    expect(v.vestedInr).toBe(204000);
  });

  it('has USD but no INR values without an exchange rate', () => {
    const v = valueRsuGrant(grant('me', 100, 40, 12), prices, null);
    expect(v.vestedUsd).toBe(2400);
    expect(v.vestedInr).toBeNull();
    expect(v.afterTaxInr).toBeNull();
  });

  it('keeps units but no values without a price', () => {
    const v = valueRsuGrant(grant('me', 100, 40, 12, 'NOPE'), prices, RATE);
    expect(v.units.sellable).toBe(28);
    expect(v.totalUsd).toBeNull();
    expect(v.vestedInr).toBeNull();
  });
});

describe('rsuTotals', () => {
  // The sheet's reconciliation totals: 619 granted, 332 vested, 105 sold for tax.
  const grants = [
    grant('me', 300, 200, 60),
    grant('me', 219, 132, 45),
    grant('wife', 100, 0, 0),
    grant('wife', 10, 10, 0, 'NOPE'),
    grant('old', 1000, 1000, 0),
  ];

  it('adds units and values across portfolios', () => {
    const totals = rsuTotals(grants.slice(0, 3), prices, RATE, ['me', 'wife']);
    expect(totals.units).toEqual({
      granted: 619,
      vested: 332,
      soldForTax: 105,
      sellable: 227,
      pending: 287,
    });
    expect(totals.totalUsd).toBe(619 * 60);
    expect(totals.vestedUsd).toBe(332 * 60);
    expect(totals.vestedInr).toBe(332 * 60 * RATE);
    expect(totals.afterTaxInr).toBeCloseTo(619 * 60 * 0.7 * RATE);
    expect(totals.unpriced).toBe(0);
  });

  it('counts the units of unpriced grants but not their value', () => {
    const totals = rsuTotals(grants, prices, RATE, ['wife']);
    expect(totals.units.granted).toBe(110);
    expect(totals.vestedUsd).toBe(0);
    expect(totals).toMatchObject({ count: 2, unpriced: 1 });
  });

  it('has no INR totals without an exchange rate, unless nothing is priced', () => {
    expect(rsuTotals(grants, prices, null, ['me']).vestedInr).toBeNull();
    expect(rsuTotals(grants, prices, null, ['me']).afterTaxInr).toBeNull();
    expect(rsuTotals([grant('me', 1, 1, 0, 'NOPE')], prices, null, ['me']).vestedInr).toBe(0);
    expect(rsuTotals([], prices, null, ['me']).afterTaxInr).toBe(0);
  });
});
