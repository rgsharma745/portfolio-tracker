import type { PfEntry } from '../../core/data/pf.service';
import {
  PfForm,
  emptyPfForm,
  interestForm,
  nextMonthForm,
  pfFormFrom,
  validatePfForm,
} from './pf-form';
import { shortMonth } from './pf-page';

const entry = (overrides: Partial<PfEntry> = {}): PfEntry => ({
  id: 'e1',
  owner_id: 'o',
  portfolio_id: 'p1',
  company: 'Acme',
  wage_month: '2026-10-01',
  contribution_type: 'monthly',
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
  month: 11,
  year: 2026,
  fy: 2026,
  employee: '1,800',
  employer: '550.50',
  pension: '1250',
  ...overrides,
});

describe('PF form', () => {
  it('saves a month as the first of that month, trimmed and parsed', () => {
    expect(validatePfForm(monthly()).value).toEqual({
      portfolio_id: 'p1',
      company: 'Acme',
      wage_month: '2026-11-01',
      contribution_type: 'monthly',
      employee_amount: 1800,
      employer_amount: 550.5,
      pension_amount: 1250,
    });
  });

  it('treats an empty pension as zero', () => {
    expect(validatePfForm(monthly({ pension: '' })).value?.pension_amount).toBe(0);
  });

  it('records interest in March of the financial year, without pension', () => {
    const value = validatePfForm(monthly({ type: 'interest', fy: 2025, pension: '999' })).value;
    expect(value?.wage_month).toBe('2026-03-01');
    expect(value?.contribution_type).toBe('interest');
    expect(value?.pension_amount).toBe(0);
  });

  it('explains what is missing or wrong', () => {
    expect(
      validatePfForm(
        monthly({
          portfolioId: '',
          company: ' ',
          month: null,
          year: null,
          employee: '',
          employer: '-1',
          pension: 'abc',
        }),
      ).errors,
    ).toEqual({
      portfolioId: 'Choose a portfolio.',
      company: 'Enter the company name.',
      month: 'Choose the wage month.',
      year: 'Choose the year.',
      employee: 'Enter the employee amount.',
      employer: 'Must be zero or more.',
      pension: 'Enter a number, e.g. 1250.50.',
    });
    expect(validatePfForm(monthly({ type: 'interest', fy: null })).errors).toEqual({
      fy: 'Choose the financial year.',
    });
    expect(validatePfForm(monthly({ company: 'x'.repeat(101) })).errors.company).toBe(
      'Use at most 100 characters.',
    );
  });

  it('prefills the next month from the last one', () => {
    expect(nextMonthForm([entry()], 'Acme', 'p1', '2026-11-06')).toEqual({
      portfolioId: 'p1',
      company: 'Acme',
      type: 'monthly',
      month: 11,
      year: 2026,
      fy: 2026,
      employee: '1800',
      employer: '550',
      pension: '1250',
    });
  });

  it('starts empty at the current month, and interest at the last March', () => {
    const empty = emptyPfForm('p1', '2026-11-06');
    expect([empty.month, empty.year, empty.company, empty.employee]).toEqual([11, 2026, '', '']);
    const interest = interestForm('p1', 'Acme', '2026-11-06');
    expect([interest.type, interest.fy, interest.company]).toEqual(['interest', 2025, 'Acme']);
    expect(interestForm('p1', 'Acme', '2026-02-10').fy).toBe(2024);
  });

  it('opens a saved row as it was entered', () => {
    const form = pfFormFrom(
      entry({ contribution_type: 'interest', wage_month: '2026-03-01', pension_amount: 0 }),
    );
    expect([form.type, form.fy, form.month, form.year]).toEqual(['interest', 2025, 3, 2026]);
  });

  it('labels months briefly', () => {
    expect(shortMonth('2026-10-01')).toBe('Oct 2026');
    expect(shortMonth('2027-01-01')).toBe('Jan 2027');
  });
});
