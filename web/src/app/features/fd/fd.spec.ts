import {
  compoundingLabel,
  durationText,
  emptyFdForm,
  fdFormFrom,
  fdPreview,
  validateFdForm,
} from './fd-form';

const filled = {
  ...emptyFdForm('me', '2025-11-08'),
  bank: ' SBI ',
  maturityDate: '2026-11-08',
  principal: '1,00,000',
  rate: '7',
};

describe('validateFdForm', () => {
  it('accepts a complete FD, quarterly by default', () => {
    expect(validateFdForm(filled)).toEqual({
      errors: {},
      value: {
        portfolio_id: 'me',
        bank: 'SBI',
        start_date: '2025-11-08',
        maturity_date: '2026-11-08',
        principal: 100_000,
        rate: 7,
        compounding: 'quarterly',
      },
    });
  });

  it('explains what is missing', () => {
    expect(validateFdForm({ ...emptyFdForm('', ''), rate: 'abc' }).errors).toEqual({
      portfolioId: 'Choose a portfolio.',
      bank: 'Enter the bank, e.g. SBI.',
      startDate: 'Pick the date of investment.',
      maturityDate: 'Pick the maturity date.',
      principal: 'Enter the principal.',
      rate: 'Enter a number, e.g. 7.25.',
    });
  });

  it('refuses a maturity on or before the start, and odd amounts or rates', () => {
    const errors = (o: Partial<typeof filled>) => validateFdForm({ ...filled, ...o }).errors;
    expect(errors({ maturityDate: '2025-11-08' })).toEqual({
      maturityDate: 'Must be after the date of investment.',
    });
    expect(errors({ principal: '0', rate: '0' })).toEqual({
      principal: 'Must be more than zero.',
      rate: 'Must be more than zero.',
    });
    expect(errors({ rate: '' }).rate).toBe('Enter the interest rate.');
    expect(errors({ rate: '-1' }).rate).toBe('Must be more than zero.');
    expect(errors({ rate: '725' }).rate).toBe('Enter the yearly rate in percent, e.g. 7.25.');
    expect(errors({ rate: '7.1234' }).rate).toBe('Use at most 3 decimals.');
    expect(errors({ bank: 'x'.repeat(61) }).bank).toBe('Use at most 60 characters.');
  });

  it('round-trips a saved FD', () => {
    const form = fdFormFrom({
      id: 'f',
      owner_id: 'o',
      portfolio_id: 'me',
      bank: 'HDFC',
      start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      principal: 50_000.5,
      rate: 7.25,
      compounding: 'monthly',
      created_at: '',
      updated_at: '',
    });
    expect(form).toEqual({
      portfolioId: 'me',
      bank: 'HDFC',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      principal: '50000.5',
      rate: '7.25',
      compounding: 'monthly',
    });
  });
});

describe('fdPreview', () => {
  it('shows the maturity amount once the form is valid', () => {
    const p = fdPreview(filled, '2025-11-08');
    expect(p?.maturityAmount).toBeCloseTo(107_185.9, 1);
    expect(p?.interest).toBeCloseTo(7_185.9, 1);
    expect(p?.days).toBe(365);
    expect(fdPreview({ ...filled, rate: '' }, '2025-11-08')).toBeNull();
  });
});

describe('durationText and compoundingLabel', () => {
  it('describes a term', () => {
    expect(durationText(1)).toBe('1 day');
    expect(durationText(45)).toBe('45 days');
    expect(durationText(334)).toBe('11 months');
    expect(durationText(365)).toBe('1 year');
    expect(durationText(444)).toBe('1 year 3 months');
    expect(durationText(1826)).toBe('5 years');
  });

  it('names the compounding', () => {
    expect(compoundingLabel('half_yearly')).toBe('half-yearly');
    expect(compoundingLabel('payout')).toBe('interest paid out');
  });
});
