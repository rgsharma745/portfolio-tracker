import type { Dividend } from '../../core/data/dividends.service';
import {
  DividendForm,
  dividendFormFrom,
  emptyDividendForm,
  inrAtRate,
  normalizeSymbol,
  validateDividendForm,
} from './dividend-form';

const form = (overrides: Partial<DividendForm> = {}): DividendForm => ({
  portfolioId: 'p1',
  market: 'IN',
  symbol: ' itc ',
  date: '2026-06-11',
  amountInr: '1,250.50',
  amountUsd: '',
  ...overrides,
});

describe('Dividend form', () => {
  it('saves an upper-case trimmed symbol, the date and the rupee amount', () => {
    expect(validateDividendForm(form()).value).toEqual({
      portfolio_id: 'p1',
      market: 'IN',
      symbol: 'ITC',
      paid_on: '2026-06-11',
      amount_inr: 1250.5,
      amount_usd: null,
    });
  });

  it('keeps the dollar amount for a US dividend and requires it', () => {
    const ok = validateDividendForm(
      form({ market: 'US', symbol: 'msft', amountInr: '6890', amountUsd: '$82.40' }),
    );
    expect(ok.value).toMatchObject({ market: 'US', symbol: 'MSFT', amount_usd: 82.4 });
    const missing = validateDividendForm(form({ market: 'US', amountUsd: '' }));
    expect(missing.value).toBeNull();
    expect(missing.errors.amountUsd).toBe('Enter the amount.');
  });

  it('drops a dollar amount left over from switching a row back to India', () => {
    expect(validateDividendForm(form({ amountUsd: '10' })).value?.amount_usd).toBeNull();
  });

  it('refuses a missing portfolio, symbol, date or amount', () => {
    const { errors, value } = validateDividendForm(
      form({ portfolioId: '', symbol: '  ', date: '', amountInr: '' }),
    );
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['amountInr', 'date', 'portfolioId', 'symbol']);
    expect(errors.symbol).toBe('Enter the symbol, e.g. ITC.');
  });

  it('refuses zero, negative and non-numeric amounts, and long symbols', () => {
    expect(validateDividendForm(form({ amountInr: '0' })).errors.amountInr).toBe(
      'Must be more than zero.',
    );
    expect(validateDividendForm(form({ amountInr: '-5' })).errors.amountInr).toBe(
      'Must be zero or more.',
    );
    expect(
      validateDividendForm(form({ market: 'US', amountUsd: 'abc' })).errors.amountUsd,
    ).toContain('Enter a number');
    expect(validateDividendForm(form({ symbol: 'X'.repeat(21) })).errors.symbol).toContain('20');
  });

  it('starts a new row today and round-trips a dividend', () => {
    expect(emptyDividendForm('p1', '2026-11-10')).toEqual({
      portfolioId: 'p1',
      market: 'IN',
      symbol: '',
      date: '2026-11-10',
      amountInr: '',
      amountUsd: '',
    });
    const dividend: Dividend = {
      id: 'd1',
      owner_id: 'o1',
      portfolio_id: 'p1',
      market: 'US',
      symbol: 'MSFT',
      paid_on: '2026-09-11',
      amount_inr: 6890.15,
      amount_usd: 82.4,
      created_at: '',
      updated_at: '',
    };
    const back = validateDividendForm(dividendFormFrom(dividend)).value;
    expect(back).toEqual({
      portfolio_id: 'p1',
      market: 'US',
      symbol: 'MSFT',
      paid_on: '2026-09-11',
      amount_inr: 6890.15,
      amount_usd: 82.4,
    });
  });

  it('suggests rupees at a rate, rounded, only for a valid dollar amount', () => {
    expect(inrAtRate('82.40', 83.5)).toBe(6880);
    expect(inrAtRate('', 83.5)).toBeNull();
    expect(inrAtRate('abc', 83.5)).toBeNull();
    expect(inrAtRate('0', 83.5)).toBeNull();
    expect(inrAtRate('10', null)).toBeNull();
    expect(normalizeSymbol(' brk.b ')).toBe('BRK.B');
  });
});
