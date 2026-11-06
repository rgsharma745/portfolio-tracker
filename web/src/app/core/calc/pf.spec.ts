import {
  PfEntryInput,
  fyLabel,
  fyStart,
  interestMonth,
  latestCompany,
  monthOf,
  nextMonth,
  nextMonthDraft,
  pfBalance,
  pfByCompany,
  pfTotals,
} from './pf';

const row = (overrides: Partial<PfEntryInput>): PfEntryInput => ({
  portfolio_id: 'p1',
  company: 'Acme',
  wage_month: '2026-10-01',
  contribution_type: 'monthly',
  employee_amount: 1800,
  employer_amount: 550,
  pension_amount: 1250,
  ...overrides,
});

const ENTRIES: PfEntryInput[] = [
  row({ wage_month: '2026-09-01' }),
  row({ wage_month: '2026-10-01', employee_amount: 1900, employer_amount: 600 }),
  row({
    wage_month: '2026-03-01',
    contribution_type: 'interest',
    employee_amount: 12000,
    employer_amount: 4000,
    pension_amount: 0,
  }),
  row({ portfolio_id: 'p2', company: 'Beta', employee_amount: 900, employer_amount: 275 }),
];

describe('pfTotals', () => {
  it('adds contributions and interest into the balance, pension apart', () => {
    expect(pfTotals(ENTRIES, ['p1'])).toEqual({
      employee: 3700,
      employer: 1150,
      interest: 16000,
      pension: 2500,
      balance: 3700 + 1150 + 16000,
    });
  });

  it('covers only the selected portfolios', () => {
    expect(pfBalance(ENTRIES, ['p2'])).toBe(1175);
    expect(pfBalance(ENTRIES, ['p1', 'p2'])).toBe(20850 + 1175);
    expect(pfTotals(ENTRIES, [])).toEqual({
      employee: 0,
      employer: 0,
      interest: 0,
      pension: 0,
      balance: 0,
    });
  });
});

describe('pfByCompany', () => {
  it('groups by portfolio and company with the last monthly wage month', () => {
    const groups = pfByCompany(
      [...ENTRIES, row({ portfolio_id: 'p2', company: 'Acme', wage_month: '2025-01-01' })],
      ['p1', 'p2'],
    );
    expect(groups.map((g) => [g.company, g.portfolioId, g.lastWageMonth, g.balance])).toEqual([
      ['Acme', 'p1', '2026-10-01', 20850],
      ['Acme', 'p2', '2025-01-01', 2350],
      ['Beta', 'p2', '2026-10-01', 1175],
    ]);
  });

  it('has no last wage month for a company with interest only', () => {
    const [only] = pfByCompany([ENTRIES[2]], ['p1']);
    expect(only.lastWageMonth).toBeNull();
    expect(only.interest).toBe(16000);
  });
});

describe('financial years and months', () => {
  it('runs April to March', () => {
    expect(fyStart('2026-03-01')).toBe(2025);
    expect(fyStart('2026-04-01')).toBe(2026);
    expect(fyStart('2026-12-01')).toBe(2026);
    expect(fyLabel(2025)).toBe('FY 2025–26');
    expect(fyLabel(2099)).toBe('FY 2099–00');
    expect(interestMonth(2025)).toBe('2026-03-01');
  });

  it('steps months across the year end', () => {
    expect(nextMonth('2026-10-01')).toBe('2026-11-01');
    expect(nextMonth('2026-12-01')).toBe('2027-01-01');
    expect(monthOf('2026-11-06')).toBe('2026-11-01');
  });
});

describe('next month', () => {
  it('picks the company of the latest monthly contribution', () => {
    expect(latestCompany(ENTRIES, ['p1', 'p2'])).toEqual({ company: 'Acme', portfolioId: 'p1' });
    expect(latestCompany([ENTRIES[2]], ['p1'])).toBeNull();
  });

  it('copies the last monthly amounts into the following month', () => {
    expect(nextMonthDraft(ENTRIES, 'Acme', 'p1', '2026-11-06')).toEqual({
      wageMonth: '2026-11-01',
      employee: 1900,
      employer: 600,
      pension: 1250,
    });
  });

  it('starts a new company at the current month with empty amounts', () => {
    expect(nextMonthDraft(ENTRIES, 'New Co', 'p1', '2026-11-06')).toEqual({
      wageMonth: '2026-11-01',
      employee: null,
      employer: null,
      pension: null,
    });
  });
});
