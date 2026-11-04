import { priceQuotes } from '../../core/calc/stocks';
import type { RsuGrant } from '../../core/data/holdings.service';
import { emptyRsuForm, rsuFormFrom, validateRsuForm } from './rsu-form';
import { buildRsuRows, singlePrice } from './rsu-rows';

const grant = (over: Partial<RsuGrant> = {}): RsuGrant => ({
  id: 'g1',
  owner_id: 'o',
  portfolio_id: 'me',
  symbol: 'SMPL',
  grant_label: '2024 annual',
  grant_date: '2024-03-15',
  units_granted: 100,
  units_vested: 40,
  units_sold_for_tax: 12,
  tax_rate: 0.3,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('buildRsuRows', () => {
  const prices = priceQuotes([
    { symbol: 'SMPL', close: 60, price_date: '2026-11-03', prev_close: 62 },
  ]);

  it('flattens units and INR values', () => {
    const [row] = buildRsuRows([grant()], prices, 85, new Map([['me', 'Me']]), ['me']);
    expect(row).toMatchObject({
      name: '2024 annual',
      portfolio: 'Me',
      sellable: 28,
      pending: 60,
      taxPercent: 30,
      vestedInr: 40 * 60 * 85,
    });
    expect(row.afterTaxInr).toBeCloseTo(100 * 60 * 0.7 * 85);
  });

  it('shows one price only when every grant has the same symbol', () => {
    const rows = buildRsuRows([grant(), grant({ id: 'g2' })], prices, 85, new Map(), ['me']);
    expect(singlePrice(rows)).toEqual({ symbol: 'SMPL', price: 60 });
    const mixed = buildRsuRows(
      [grant(), grant({ id: 'g2', symbol: 'OTHER' })],
      prices,
      85,
      new Map(),
      ['me'],
    );
    expect(singlePrice(mixed)).toBeNull();
    expect(singlePrice([])).toBeNull();
  });
});

describe('validateRsuForm', () => {
  const valid = {
    ...emptyRsuForm('me', 'smpl'),
    label: ' 2025 refresh ',
    grantDate: '2025-03-15',
    granted: '120',
    vested: '30',
    soldForTax: '10',
    taxPercent: '30',
  };

  it('accepts a valid grant and stores the tax rate as a fraction', () => {
    expect(validateRsuForm(valid).value).toEqual({
      portfolio_id: 'me',
      symbol: 'SMPL',
      grant_label: '2025 refresh',
      grant_date: '2025-03-15',
      units_granted: 120,
      units_vested: 30,
      units_sold_for_tax: 10,
      tax_rate: 0.3,
    });
  });

  it('keeps vested within granted and sold within vested', () => {
    expect(validateRsuForm({ ...valid, vested: '121' }).errors.vested).toBe(
      'Cannot be more than the units granted.',
    );
    expect(validateRsuForm({ ...valid, soldForTax: '31' }).errors.soldForTax).toBe(
      'Cannot be more than the units vested.',
    );
  });

  it('checks the tax rate, label and symbol', () => {
    const { errors } = validateRsuForm({
      ...valid,
      symbol: '',
      label: '',
      taxPercent: '130',
      grantDate: 'soon',
    });
    expect(errors).toEqual({
      symbol: 'Enter the stock symbol, e.g. AAPL.',
      label: 'Name the grant, e.g. "2024 annual".',
      taxPercent: 'Use 0 to 100%.',
      grantDate: 'Pick a date.',
    });
    expect(validateRsuForm({ ...valid, taxPercent: '' }).errors.taxPercent).toBe(
      'Enter the tax rate.',
    );
  });

  it('round-trips a saved grant, including an awkward tax rate', () => {
    const form = rsuFormFrom(grant({ tax_rate: 0.3125 }));
    expect(form.taxPercent).toBe('31.25');
    expect(validateRsuForm(form).value?.tax_rate).toBe(0.3125);
  });
});
