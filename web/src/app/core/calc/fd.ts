import { daysBetween, inPortfolios } from './common';

/**
 * Fixed deposits (docs/DATA_MODEL.md, "Fixed deposits"). Each FD has a principal, a yearly
 * rate in percent, start and maturity dates and a compounding choice. Interest compounds
 * `n` times a year over `t` years, with `t` = days / 365 (fractions included):
 *
 *     amount = principal × (1 + rate / 100 / n) ^ (n × t)
 *
 * A `payout` FD pays its interest out as it is earned, so it returns the principal. Banks
 * round per quarter, so their figure can differ from this by a few rupees.
 */

export type FdCompounding = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'payout';

/** Compounding periods per year; 0 for payout. */
export const COMPOUNDING_PER_YEAR: Record<FdCompounding, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
  payout: 0,
};

/** An FD maturing within this many days gets a "Matures soon" tag. */
export const FD_SOON_DAYS = 30;

const DAYS_PER_YEAR = 365;

export interface FdInput {
  portfolio_id: string;
  /** `YYYY-MM-DD`. */
  start_date: string;
  /** `YYYY-MM-DD`, after the start date. */
  maturity_date: string;
  principal: number;
  /** Yearly rate in percent, e.g. 7.25. */
  rate: number;
  compounding: string;
}

export interface FdView {
  maturityAmount: number;
  /** Interest earned by maturity: maturity amount − principal (0 for payout). */
  maturityInterest: number;
  /** Principal + interest earned so far (the maturity amount once matured). */
  value: number;
  /** Interest earned so far: value − principal. */
  accrued: number;
  /** Days from today to maturity, never below 0. */
  daysLeft: number;
  /** Days from start to maturity. */
  totalDays: number;
  /** Share of the term gone by, 0 to 100. */
  progress: number;
  matured: boolean;
  /** Matures within {@link FD_SOON_DAYS} days (and has not yet). */
  soon: boolean;
}

export interface FdTotals {
  principal: number;
  value: number;
  accrued: number;
  maturityAmount: number;
  maturityInterest: number;
  count: number;
  matured: number;
}

function perYear(compounding: string): number {
  return COMPOUNDING_PER_YEAR[compounding as FdCompounding] ?? COMPOUNDING_PER_YEAR.quarterly;
}

/** Principal + interest after `days` days of the term (clamped to the term). */
function amountAfter(fd: FdInput, days: number): number {
  const n = perYear(fd.compounding);
  if (n === 0) return fd.principal;
  const term = daysBetween(fd.start_date, fd.maturity_date);
  const t = Math.min(Math.max(days, 0), term) / DAYS_PER_YEAR;
  return fd.principal * Math.pow(1 + fd.rate / 100 / n, n * t);
}

/** What the FD pays on its maturity date. */
export function fdMaturityAmount(fd: FdInput): number {
  return amountAfter(fd, daysBetween(fd.start_date, fd.maturity_date));
}

/** Maturity amount, value today, days left and progress of one FD. */
export function fdView(fd: FdInput, today: string): FdView {
  const totalDays = daysBetween(fd.start_date, fd.maturity_date);
  const elapsed = Math.min(Math.max(daysBetween(fd.start_date, today), 0), totalDays);
  const daysLeft = Math.max(daysBetween(today, fd.maturity_date), 0);
  const maturityAmount = fdMaturityAmount(fd);
  const value = amountAfter(fd, elapsed);
  const matured = daysLeft === 0;
  return {
    maturityAmount,
    maturityInterest: maturityAmount - fd.principal,
    value,
    accrued: value - fd.principal,
    daysLeft,
    totalDays,
    progress: totalDays > 0 ? (elapsed / totalDays) * 100 : 100,
    matured,
    soon: !matured && daysLeft <= FD_SOON_DAYS,
  };
}

/** Totals over the FDs in the given portfolios. */
export function fdTotals(
  fds: readonly FdInput[],
  portfolioIds: readonly string[],
  today: string,
): FdTotals {
  return inPortfolios(fds, portfolioIds).reduce<FdTotals>(
    (t, fd) => {
      const v = fdView(fd, today);
      return {
        principal: t.principal + fd.principal,
        value: t.value + v.value,
        accrued: t.accrued + v.accrued,
        maturityAmount: t.maturityAmount + v.maturityAmount,
        maturityInterest: t.maturityInterest + v.maturityInterest,
        count: t.count + 1,
        matured: t.matured + (v.matured ? 1 : 0),
      };
    },
    {
      principal: 0,
      value: 0,
      accrued: 0,
      maturityAmount: 0,
      maturityInterest: 0,
      count: 0,
      matured: 0,
    },
  );
}

/** The value today of the FDs in the given portfolios (the snapshot's `fd_value`). */
export function fdValue(
  fds: readonly FdInput[],
  portfolioIds: readonly string[],
  today: string,
): number {
  return fdTotals(fds, portfolioIds, today).value;
}
