import { inPortfolios } from './common';

/**
 * Provident fund (docs/DATA_MODEL.md, "PF"). Rows are monthly contributions or the yearly
 * interest credit (recorded in March of the financial year). The PF balance is employee +
 * employer contributions + interest; pension (EPS) is reported on its own and never added in.
 */

export type PfContributionType = 'monthly' | 'interest';

export interface PfEntryInput {
  portfolio_id: string;
  company: string;
  /** First of the month, `YYYY-MM-01`. */
  wage_month: string;
  contribution_type: string;
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

export interface PfCompanySummary extends PfTotals {
  portfolioId: string;
  company: string;
  /** The latest monthly wage month, or null if the company has only interest rows. */
  lastWageMonth: string | null;
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
  return inPortfolios(entries, portfolioIds).reduce(addEntry, ZERO);
}

/** The PF balance (employee + employer + interest) for the given portfolios. */
export function pfBalance(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): number {
  return pfTotals(entries, portfolioIds).balance;
}

/** Totals per portfolio and company, sorted by company then portfolio. */
export function pfByCompany(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): PfCompanySummary[] {
  const groups = new Map<string, PfCompanySummary>();
  for (const e of inPortfolios(entries, portfolioIds)) {
    const key = `${e.portfolio_id}\u0000${e.company}`;
    const current = groups.get(key) ?? {
      ...ZERO,
      portfolioId: e.portfolio_id,
      company: e.company,
      lastWageMonth: null,
    };
    const lastWageMonth =
      e.contribution_type === 'monthly' &&
      (current.lastWageMonth === null || e.wage_month > current.lastWageMonth)
        ? e.wage_month
        : current.lastWageMonth;
    groups.set(key, { ...current, ...addEntry(current, e), lastWageMonth });
  }
  return [...groups.values()].sort(
    (a, b) => a.company.localeCompare(b.company) || a.portfolioId.localeCompare(b.portfolioId),
  );
}

/** The calendar year a financial year (April to March) starts in: 2026-03 → 2025. */
export function fyStart(wageMonth: string): number {
  const [year, month] = wageMonth.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

/** "FY 2025–26" for the financial year starting in April of `start`. */
export function fyLabel(start: number): string {
  return `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Interest for a financial year is recorded in March, at its end. */
export function interestMonth(fyStartYear: number): string {
  return `${fyStartYear + 1}-03-01`;
}

/** First of the month after `wageMonth`. */
export function nextMonth(wageMonth: string): string {
  const [year, month] = wageMonth.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** First of the month that `today` (`YYYY-MM-DD`) falls in. */
export function monthOf(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/** The company and portfolio of the most recent monthly contribution, or null if none. */
export function latestCompany(
  entries: readonly PfEntryInput[],
  portfolioIds: readonly string[],
): { company: string; portfolioId: string } | null {
  const latest = inPortfolios(entries, portfolioIds)
    .filter((e) => e.contribution_type === 'monthly')
    .reduce<PfEntryInput | null>(
      (best, e) => (best === null || e.wage_month > best.wage_month ? e : best),
      null,
    );
  return latest ? { company: latest.company, portfolioId: latest.portfolio_id } : null;
}

export interface PfMonthDraft {
  wageMonth: string;
  employee: number | null;
  employer: number | null;
  pension: number | null;
}

/**
 * The next monthly row for a company: the month after its last monthly contribution with
 * the same three amounts (contributions rarely change month to month). A company with no
 * monthly rows yet starts at the current month with empty amounts.
 */
export function nextMonthDraft(
  entries: readonly PfEntryInput[],
  company: string,
  portfolioId: string,
  today: string,
): PfMonthDraft {
  const last = entries
    .filter(
      (e) =>
        e.portfolio_id === portfolioId &&
        e.company === company &&
        e.contribution_type === 'monthly',
    )
    .reduce<PfEntryInput | null>(
      (best, e) => (best === null || e.wage_month > best.wage_month ? e : best),
      null,
    );
  if (!last) return { wageMonth: monthOf(today), employee: null, employer: null, pension: null };
  return {
    wageMonth: nextMonth(last.wage_month),
    employee: last.employee_amount,
    employer: last.employer_amount,
    pension: last.pension_amount,
  };
}
