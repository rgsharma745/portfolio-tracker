import {
  PfEntryInput,
  addMonth,
  fyLabel,
  fyStart,
  latestCompany,
  nextMonthDraft,
  nextWage,
  pfBalance,
  pfByCompany,
  pfTotals,
  previousWage,
  wageKey,
  wageLabel,
  wageMonthNumber,
  wagePeriod,
} from './pf';

const monthly = (overrides: Partial<PfEntryInput>): PfEntryInput => ({
  portfolio_id: 'p1',
  company: 'Acme',
  contribution_type: 'monthly',
  wage_month: 'Oct',
  wage_year: 2026,
  transaction_date: '2026-11-08',
  employee_amount: 1800,
  employer_amount: 550,
  pension_amount: 1250,
  ...overrides,
});

const INTEREST: PfEntryInput = monthly({
  contribution_type: 'interest',
  wage_month: null,
  wage_year: null,
  transaction_date: '2026-08-20',
  employee_amount: 12000,
  employer_amount: 4000,
  pension_amount: 0,
});

const ENTRIES: PfEntryInput[] = [
  monthly({ wage_month: 'Sep', transaction_date: '2026-10-31' }),
  monthly({ employee_amount: 1900, employer_amount: 600, transaction_date: '2026-11-30' }),
  INTEREST,
  monthly({ portfolio_id: 'p2', company: 'Beta', employee_amount: 900, employer_amount: 275 }),
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
    expect(pfBalance(ENTRIES, [])).toBe(0);
  });
});

describe('wage months', () => {
  it('reads Jan to Dec, and nothing else', () => {
    expect(wageMonthNumber('Jan')).toBe(1);
    expect(wageMonthNumber('Dec')).toBe(12);
    expect(wageMonthNumber('March')).toBe(0);
    expect(wageMonthNumber(null)).toBe(0);
    expect(wagePeriod({ wage_month: 'Mar', wage_year: 2025 })).toEqual({ month: 3, year: 2025 });
    expect(wagePeriod({ wage_month: null, wage_year: null })).toBeNull();
    expect(wageLabel({ month: 3, year: 2025 })).toBe('Mar 2025');
  });

  it('orders and steps across the year end', () => {
    expect(wageKey({ month: 12, year: 2025 })).toBeLessThan(wageKey({ month: 1, year: 2026 }));
    expect(nextWage({ month: 12, year: 2025 })).toEqual({ month: 1, year: 2026 });
    expect(nextWage({ month: 3, year: 2025 })).toEqual({ month: 4, year: 2025 });
    expect(previousWage('2026-01-15')).toEqual({ month: 12, year: 2025 });
    expect(previousWage('2026-11-07')).toEqual({ month: 10, year: 2026 });
  });

  it('moves a date one month on, within the month', () => {
    expect(addMonth('2026-10-08')).toBe('2026-11-08');
    expect(addMonth('2026-01-31')).toBe('2026-02-28');
    expect(addMonth('2026-12-15')).toBe('2027-01-15');
  });
});

describe('financial years', () => {
  it('runs April to March, by date', () => {
    expect(fyStart('2026-03-31')).toBe(2025);
    expect(fyStart('2026-04-01')).toBe(2026);
    expect(fyLabel(2025)).toBe('FY 2025–26');
    expect(fyLabel(2099)).toBe('FY 2099–00');
  });
});

describe('pfByCompany', () => {
  it('groups by portfolio and company with the last wage month paid', () => {
    const groups = pfByCompany(
      [...ENTRIES, monthly({ portfolio_id: 'p2', wage_month: 'Jan', wage_year: 2025 })],
      ['p1', 'p2'],
    );
    expect(groups.map((g) => [g.company, g.portfolioId, g.lastWage, g.balance])).toEqual([
      ['Acme', 'p1', { month: 10, year: 2026 }, 20850],
      ['Acme', 'p2', { month: 1, year: 2025 }, 2350],
      ['Beta', 'p2', { month: 10, year: 2026 }, 1175],
    ]);
  });

  it('has no last wage month for a company with interest only', () => {
    const [only] = pfByCompany([INTEREST], ['p1']);
    expect(only.lastWage).toBeNull();
    expect(only.interest).toBe(16000);
  });
});

describe('next month', () => {
  it('picks the company of the latest wage month', () => {
    expect(latestCompany(ENTRIES, ['p1', 'p2'])).toEqual({ company: 'Acme', portfolioId: 'p1' });
    expect(latestCompany([INTEREST], ['p1'])).toBeNull();
  });

  it('is the wage month after the last, credited a month later, same amounts', () => {
    expect(nextMonthDraft(ENTRIES, 'Acme', 'p1', '2026-12-02')).toEqual({
      wage: { month: 11, year: 2026 },
      transactionDate: '2026-12-30',
      employee: 1900,
      employer: 600,
      pension: 1250,
    });
  });

  it('starts a new company at last month credited today, with empty amounts', () => {
    expect(nextMonthDraft(ENTRIES, 'New Co', 'p1', '2026-11-07')).toEqual({
      wage: { month: 10, year: 2026 },
      transactionDate: '2026-11-07',
      employee: null,
      employer: null,
      pension: null,
    });
  });
});
