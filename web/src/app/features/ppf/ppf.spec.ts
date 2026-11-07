import type { PpfYearRow } from '../../core/calc/ppf';
import type { PpfEntry } from '../../core/data/ppf.service';
import { PpfForm, emptyPpfForm, ppfFormFrom, validatePpfForm } from './ppf-form';
import { yearFlags } from './ppf-page';

const form = (overrides: Partial<PpfForm> = {}): PpfForm => ({
  portfolioId: 'p1',
  account: ' SBI PPF ',
  type: 'investment',
  date: '2026-04-05',
  amount: '1,50,000',
  ...overrides,
});

describe('PPF form', () => {
  it('saves a trimmed account, the type, date and amount', () => {
    expect(validatePpfForm(form()).value).toEqual({
      portfolio_id: 'p1',
      account: 'SBI PPF',
      entry_type: 'investment',
      entry_date: '2026-04-05',
      amount: 150000,
    });
  });

  it('refuses a missing portfolio, account, date or amount', () => {
    const { errors, value } = validatePpfForm(
      form({ portfolioId: '', account: '  ', date: '', amount: '' }),
    );
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['account', 'amount', 'date', 'portfolioId']);
  });

  it('refuses zero, negative and non-numeric amounts, and long names', () => {
    expect(validatePpfForm(form({ amount: '0' })).errors.amount).toBe('Must be more than zero.');
    expect(validatePpfForm(form({ amount: '-5' })).errors.amount).toBe('Must be zero or more.');
    expect(validatePpfForm(form({ amount: 'abc' })).errors.amount).toContain('Enter a number');
    expect(validatePpfForm(form({ account: 'x'.repeat(101) })).errors.account).toContain('100');
  });

  it('starts a new row today and round-trips an entry', () => {
    expect(emptyPpfForm('p1', 'SBI PPF', '2026-11-07', 'interest')).toEqual({
      portfolioId: 'p1',
      account: 'SBI PPF',
      type: 'interest',
      date: '2026-11-07',
      amount: '',
    });
    const entry: PpfEntry = {
      id: 'e1',
      owner_id: 'o',
      portfolio_id: 'p1',
      account: 'SBI PPF',
      entry_type: 'interest',
      entry_date: '2026-03-31',
      amount: 10650.5,
      created_at: '',
      updated_at: '',
    };
    const f = ppfFormFrom(entry);
    expect(f.type).toBe('interest');
    expect(validatePpfForm(f).value).toEqual({
      portfolio_id: 'p1',
      account: 'SBI PPF',
      entry_type: 'interest',
      entry_date: '2026-03-31',
      amount: 10650.5,
    });
  });
});

describe('yearFlags', () => {
  const row = (overrides: Partial<PpfYearRow>): PpfYearRow => ({
    fyStart: 2025,
    label: 'FY 2025–26',
    invested: 0,
    interest: 0,
    closingBalance: 0,
    roomLeft: null,
    overLimit: [],
    belowMinimum: [],
    ...overrides,
  });

  it('names the accounts only when the table covers several', () => {
    const r = row({ overLimit: ['SBI PPF'], belowMinimum: ['Post office'] });
    expect(yearFlags(r, true)).toEqual(['Over ₹1.5 lakh', 'Below ₹500']);
    expect(yearFlags(r, false)).toEqual(['Over ₹1.5 lakh: SBI PPF', 'Below ₹500: Post office']);
    expect(yearFlags(row({}), false)).toEqual([]);
  });
});
