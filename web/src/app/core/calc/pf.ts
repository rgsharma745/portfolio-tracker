import { daysInMonth, inPortfolios, isoDate, parseIsoDate } from './common';

/**
 * Provident fund (docs/DATA_MODEL.md, "PF"), rows as in the EPFO passbook. A monthly
 * contribution has the wage month and year it pays for and the date it was credited; an
 * interest credit has only its transaction date and counts for that date's financial year
 * (April to March). The PF balance is employee + employer contributions + interest; pension
 * (EPS) is reported on its own and never added in.
 */

export type PfContributionType = 'monthly' | 'interest';

/** Wage months as stored (`wage_month`). */
export const WAGE_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
export type WageMonth = (typeof WAGE_MONTHS)[number];

export interface PfEntryInput {
  portfolio_id: string;
  company: string;
  contribution_type: string;
  /** `Jan` to `Dec` for monthly rows, null for interest. */
  wage_month: string | null;
  wage_year: number | null;
  /** When the amount was credited, `YYYY-MM-DD`. */
  transaction_date: string;
  employee_amount: number;
  employer_amount: number;
  pension_amount: number;
}

export interface PfTotals {
  /** Employee share of monthly contributions. */
  employee: number;
  /** Employer share of monthly contributions (EPF part, excluding pension). */
  employer: number;
  /** Interest credited (employee + employer interest). */
  interest: number;
  /** Pension (EPS): shown apart, not part of the balance. */
  pension: number;
  /** employee + employer + interest. */
  balance: number;
}

/** A wage month with its year; `month` is 1 to 12. */
export interface WagePeriod {
  month: number;
  year: number;
}

export interface PfCompanySummary extends PfTotals {
  portfolioId: string;
  company: string;
  /** The latest wage month paid, or null if the company has only interest rows. */
  lastWage: WagePeriod | null;
}

const ZERO: PfTotals = { employee: 0, employer: 0, interest: 0, pension: 0, balance: 0 };

function addEntry(totals: PfTotals, e: PfEntryInput): PfTotals {
  if (e.contribution_type === 'interest') {
    const interest = e.employee_amount + e.employer_amount;
    return { ...totals, interest: totals.interest + interest, balance: totals.balance + interest };
  }
  return {
    employee: totals.employee + e.employee_amount,
    employer: totals.employer + e.employer_amount,
    interest: totals.interest,
    pension: totals.pension + e.pension_amount,
    balance: totals.balance + e.employee_amount + e.employer_amount,
  };
}

/** Totals over the entries in the given portfolios. */
export function pfTotals(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): PfTotals {
  return inPortfolios(entries, portfolioIds).reduce((t, e) => addEntry(t, e), ZERO);
}

/** The PF balance (employee + employer + interest) for the given portfolios. */
export function pfBalance(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): number {
  return pfTotals(entries, portfolioIds).balance;
}

/** 1 to 12 for `Jan` to `Dec`, or 0 for anything else. */
export function wageMonthNumber(name: string | null): number {
  return WAGE_MONTHS.indexOf(name as WageMonth) + 1;
}

/** The wage period of a monthly row, or null (interest, or an unknown month name). */
export function wagePeriod(e: Pick<PfEntryInput, 'wage_month' | 'wage_year'>): WagePeriod | null {
  const month = wageMonthNumber(e.wage_month);
  return month && e.wage_year ? { month, year: e.wage_year } : null;
}

/** A sortable number for a wage period (later is larger). */
export function wageKey(p: WagePeriod): number {
  return p.year * 12 + (p.month - 1);
}

/** "Mar 2025". */
export function wageLabel(p: WagePeriod): string {
  return `${WAGE_MONTHS[p.month - 1]} ${p.year}`;
}

/** The latest monthly row of a list, by wage period. */
function latestMonthly<T extends PfEntryInput>(entries: readonly T[]): T | null {
  let best: T | null = null;
  let bestKey = -1;
  for (const e of entries) {
    const period = e.contribution_type === 'monthly' ? wagePeriod(e) : null;
    if (period && wageKey(period) > bestKey) {
      best = e;
      bestKey = wageKey(period);
    }
  }
  return best;
}

/** Totals per portfolio and company, sorted by company then portfolio. */
export function pfByCompany(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): PfCompanySummary[] {
  const groups = new Map<string, { portfolioId: string; company: string; rows: PfEntryInput[] }>();
  for (const e of inPortfolios(entries, portfolioIds)) {
    const key = `${e.portfolio_id}\u0000${e.company}`;
    const group = groups.get(key) ?? { portfolioId: e.portfolio_id, company: e.company, rows: [] };
    group.rows.push(e);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ portfolioId, company, rows }) => {
      const last = latestMonthly(rows);
      return {
        ...rows.reduce((t, e) => addEntry(t, e), ZERO),
        portfolioId,
        company,
        lastWage: last ? wagePeriod(last) : null,
      };
    })
    .sort(
      (a, b) => a.company.localeCompare(b.company) || a.portfolioId.localeCompare(b.portfolioId),
    );
}

/** The calendar year a financial year (April to March) starts in: 2026-03-31 → 2025. */
export function fyStart(date: string): number {
  const { year, month } = parseIsoDate(date);
  return month >= 4 ? year : year - 1;
}

/** "FY 2025–26" for the financial year starting in April of `start`. */
export function fyLabel(start: number): string {
  return `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The wage period after `p`. */
export function nextWage(p: WagePeriod): WagePeriod {
  return p.month === 12 ? { month: 1, year: p.year + 1 } : { month: p.month + 1, year: p.year };
}

/** The same day one month later, kept within the month (31 Jan → 28 or 29 Feb). */
export function addMonth(date: string): string {
  const { year, month, day } = parseIsoDate(date);
  const next = nextWage({ month, year });
  return isoDate(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month)));
}

/** The previous calendar month of `today`: the wage month usually credited in `today`'s month. */
export function previousWage(today: string): WagePeriod {
  const { year, month } = parseIsoDate(today);
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

/** The company and portfolio of the latest monthly contribution, or null if none. */
export function latestCompany(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): { company: string; portfolioId: string } | null {
  const latest = latestMonthly(inPortfolios(entries, portfolioIds));
  return latest ? { company: latest.company, portfolioId: latest.portfolio_id } : null;
}

export interface PfMonthDraft {
  wage: WagePeriod;
  transactionDate: string;
  employee: number | null;
  employer: number | null;
  pension: number | null;
}

/**
 * The next monthly row for a company: the wage month after its last contribution, credited
 * a month after that one was, with the same three amounts (they rarely change). A company
 * with no monthly rows yet starts at last month's wages credited today, with empty amounts.
 */
export function nextMonthDraft(
  entries: readonly PfEntryInput[],
  company: string,
  portfolioId: string,
  today: string,
): PfMonthDraft {
  const last = latestMonthly(
    entries.filter((e) => e.portfolio_id === portfolioId && e.company === company),
  );
  const lastWage = last ? wagePeriod(last) : null;
  if (!last || !lastWage) {
    return {
      wage: previousWage(today),
      transactionDate: today,
      employee: null,
      employer: null,
      pension: null,
    };
  }
  return {
    wage: nextWage(lastWage),
    transactionDate: addMonth(last.transaction_date),
    employee: last.employee_amount,
    employer: last.employer_amount,
    pension: last.pension_amount,
  };
}
