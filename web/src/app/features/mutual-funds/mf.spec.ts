import { navQuotes } from '../../core/calc/mf';
import type { MfHolding } from '../../core/data/holdings.service';
import { emptyMfForm, mfFormFrom, validateMfForm } from './mf-form';
import { buildMfRows } from './mf-rows';

const holding = (over: Partial<MfHolding>): MfHolding => ({
  id: 'h1',
  owner_id: 'o',
  portfolio_id: 'me',
  scheme_code: '100',
  scheme_name: 'Alpha Fund',
  folio: null,
  units: 10,
  invested: 400,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('buildMfRows', () => {
  it('flattens holdings in scope with their valuation and portfolio name', () => {
    const rows = buildMfRows(
      [holding({}), holding({ id: 'h2', portfolio_id: 'old' })],
      navQuotes([{ scheme_code: '100', nav: 50, nav_date: '2026-11-03', prev_nav: 49 }]),
      new Map([['me', 'Me']]),
      ['me'],
      '2026-11-04',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Alpha Fund',
      portfolio: 'Me',
      nav: 50,
      value: 500,
      pl: 100,
      dayChange: 10,
      stale: false,
    });
  });
});

describe('validateMfForm', () => {
  const valid = {
    ...emptyMfForm('me'),
    schemeName: '  Alpha Fund ',
    schemeCode: ' 120503 ',
    units: '1,234.5678',
    invested: '50000',
  };

  it('accepts a valid form and trims it', () => {
    expect(validateMfForm(valid)).toEqual({
      errors: {},
      value: {
        portfolio_id: 'me',
        scheme_name: 'Alpha Fund',
        scheme_code: '120503',
        folio: null,
        units: 1234.5678,
        invested: 50000,
      },
    });
  });

  it('allows a missing scheme code', () => {
    expect(validateMfForm({ ...valid, schemeCode: '' }).value?.scheme_code).toBeNull();
  });

  it('explains each problem', () => {
    const { errors, value } = validateMfForm({
      portfolioId: '',
      schemeName: ' ',
      schemeCode: 'INF123',
      folio: '',
      units: '-1',
      invested: 'abc',
    });
    expect(value).toBeNull();
    expect(errors).toEqual({
      portfolioId: 'Choose a portfolio.',
      schemeName: 'Enter the fund name.',
      schemeCode: 'AMFI scheme codes are numbers only.',
      units: 'Must be zero or more.',
      invested: 'Enter a number, e.g. 1250.50.',
    });
    expect(validateMfForm({ ...valid, units: '' }).errors.units).toBe('Enter units.');
  });

  it('round-trips a saved holding', () => {
    const form = mfFormFrom(holding({ folio: '123/45' }));
    expect(form).toMatchObject({ units: '10', invested: '400', folio: '123/45' });
    expect(validateMfForm({ ...form, folio: ' 123 / 45 ' }).value?.folio).toBe('123/45');
  });
});
