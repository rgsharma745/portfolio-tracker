import type { PfEntry } from '../../core/data/pf.service';
import {
  PfForm,
  emptyPfForm,
  interestForm,
  nextMonthForm,
  pfFormFrom,
  switchType,
  validatePfForm,
} from './pf-form';
import { rowTitle } from './pf-page';

const TODAY = '2026-11-07';

const entry = (overrides: Partial<PfEntry> = {}): PfEntry => ({
  id: 'e1',
  owner_id: 'o',
  portfolio_id: 'p1',
  company: 'Acme',
  contribution_type: 'monthly',
  wage_month: 'Sep',
  wage_year: 2026,
  transaction_date: '2026-10-08',
  employee_amount: 1800,
  employer_amount: 550,
  pension_amount: 1250,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const monthly = (overrides: Partial<PfForm> = {}): PfForm => ({
  portfolioId: 'p1',
  company: ' Acme ',
  type: 'monthly',
  month: 3,
  year: 2025,
  transactionDate: '2025-04-08',
  employee: '1,800',
  employer: '550.50',
  pension: '1250',
  ...overrides,
});

describe('PF form', () => {
  it('saves a monthly row with its wage month name, year and transaction date', () => {
    expect(validatePfForm(monthly()).value).toEqual({
      portfolio_id: 'p1',
      company: 'Acme',
      contribution_type: 'monthly',
      wage_month: 'Mar',
      wage_year: 2025,
      transaction_date: '2025-04-08',
      employee_amount: 1800,
      employer_amount: 550.5,
      pension_amount: 1250,
    });
  });

  it('treats an empty pension as zero', () => {
    expect(validatePfForm(monthly({ pension: '' })).value?.pension_amount).toBe(0);
  });

  it('saves interest without a wage month or pension', () => {
    const value = validatePfForm(
      monthly({ type: 'interest', month: null, year: null, pension: '999' }),
    ).value;
    expect(value).toMatchObject({
      contribution_type: 'interest',
      wage_month: null,
      wage_year: null,
      pension_amount: 0,
    });
  });

  it('explains what is missing or wrong', () => {
    expect(
      validatePfForm(
        monthly({
          portfolioId: '',
          company: ' ',
          month: null,
          year: null,
          transactionDate: '',
          employee: '',
          employer: '-1',
          pension: 'abc',
        }),
      ).errors,
    ).toEqual({
      portfolioId: 'Choose a portfolio.',
      company: 'Enter the company name.',
      month: 'Choose the wage month.',
      year: 'Choose the wage year.',
      transactionDate: 'Pick the date it was credited.',
      employee: 'Enter the employee amount.',
      employer: 'Must be zero or more.',
      pension: 'Enter a number, e.g. 1250.50.',
    });
    // Interest needs no wage month
    expect(validatePfForm(monthly({ type: 'interest', month: null, year: null })).errors).toEqual(
      {},
    );
    expect(validatePfForm(monthly({ company: 'x'.repeat(101) })).errors.company).toBe(
      'Use at most 100 characters.',
    );
  });

  it('prefills the next wage month, credited a month after the last', () => {
    expect(nextMonthForm([entry()], 'Acme', 'p1', TODAY)).toEqual({
      portfolioId: 'p1',
      company: 'Acme',
      type: 'monthly',
      month: 10,
      year: 2026,
      transactionDate: '2026-11-08',
      employee: '1800',
      employer: '550',
      pension: '1250',
    });
  });

  it('starts a new company at last month credited today; interest credited today', () => {
    expect(emptyPfForm('p1', '', TODAY)).toMatchObject({
      month: 10,
      year: 2026,
      transactionDate: TODAY,
      employee: '',
    });
    expect(interestForm('p1', 'Acme', TODAY)).toMatchObject({
      type: 'interest',
      month: null,
      year: null,
      transactionDate: TODAY,
      company: 'Acme',
      employee: '',
    });
  });

  it('opens a saved row as it was entered', () => {
    expect(pfFormFrom(entry())).toMatchObject({
      month: 9,
      year: 2026,
      transactionDate: '2026-10-08',
    });
    const interest = pfFormFrom(
      entry({
        contribution_type: 'interest',
        wage_month: null,
        wage_year: null,
        pension_amount: 0,
      }),
    );
    expect([interest.type, interest.month, interest.year, interest.pension]).toEqual([
      'interest',
      null,
      null,
      '',
    ]);
  });

  it("never carries a month's amounts into interest, or back", () => {
    const next = nextMonthForm([entry()], 'Acme', 'p1', TODAY);
    const interest = switchType(next, 'interest', [entry()], TODAY);
    expect(interest).toMatchObject({
      type: 'interest',
      company: 'Acme',
      month: null,
      employee: '',
      employer: '',
      pension: '',
      transactionDate: TODAY,
    });
    expect(switchType(interest, 'monthly', [entry()], TODAY)).toEqual(next);
    const fresh = switchType({ ...interest, company: 'New Co' }, 'monthly', [entry()], TODAY);
    expect([fresh.company, fresh.month, fresh.year, fresh.employee]).toEqual([
      'New Co',
      10,
      2026,
      '',
    ]);
    expect(switchType(next, 'monthly', [entry()], TODAY)).toBe(next);
  });

  it('titles rows by wage month, or Interest', () => {
    expect(rowTitle({ type: 'monthly', wageLabel: 'Mar 2025' })).toBe('Mar 2025');
    expect(rowTitle({ type: 'interest', wageLabel: null })).toBe('Interest');
  });
});
