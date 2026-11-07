import { fyLabel, fyStart, inPortfolios, plPercent, valueHolding } from './common';
import { NavQuotes } from './mf';
import { CashFlow, xirr } from './xirr';

/**
 * National Pension System, Tier I (docs/DATA_MODEL.md, "NPS").
 * Holdings are units per account and scheme class; value = Σ units × NAV.
 * Contributions (self or employer) are not split by scheme, so invested, P&L and XIRR are
 * per account (or over several accounts), never per scheme.
 * XIRR: every contribution paid in on its date, and the current value taken out today.
 */

export const NPS_SCHEME_CLASSES = ['E', 'C', 'G', 'A'] as const;
export type NpsSchemeClass = (typeof NPS_SCHEME_CLASSES)[number];

export const NPS_SCHEME_LABEL: Record<NpsSchemeClass, string> = {
  E: 'Equity',
  C: 'Corporate debt',
  G: 'Government securities',
  A: 'Alternative assets',
};

export type NpsContributor = 'self' | 'employer';

export interface NpsHoldingInput {
  portfolio_id: string;
  account: string;
  scheme_class: string;
  scheme_code: string | null;
  units: number;
  /** The statement date the units are from, `YYYY-MM-DD`. */
  units_as_of: string | null;
}

export interface NpsContributionInput {
  portfolio_id: string;
  account: string;
  /** `YYYY-MM-DD`. */
  contribution_date: string;
  contributor: string;
  amount: number;
}

/** One scheme's value. Money fields are null without a NAV. */
export interface NpsHoldingValue {
  value: number | null;
  dayChange: number | null;
  nav: number | null;
  navDate: string | null;
  stale: boolean;
}

export interface NpsTotals {
  /** Σ units × NAV over schemes with a NAV. */
  value: number;
  /** self + employer contributions. */
  invested: number;
  self: number;
  employer: number;
  pl: number;
  plPercent: number;
  dayChange: number;
  /** Schemes without a NAV (left out of value). */
  unpriced: number;
  /** Yearly return, or null when there is none to show (see {@link npsXirr}). */
  xirr: number | null;
}

export interface NpsMix {
  schemeClass: NpsSchemeClass;
  label: string;
  value: number;
  /** Share of the priced value, 0 to 100. */
  percent: number;
}

export interface NpsAccountSummary extends NpsTotals {
  /** {@link npsAccountKey} of the account. */
  key: string;
  portfolioId: string;
  account: string;
  mix: NpsMix[];
  /** The latest statement date among the account's units, or null. */
  unitsAsOf: string | null;
  /** The latest contribution date, or null. */
  lastContribution: string | null;
  /** A contribution is newer than the units: value (and XIRR) read low until units are updated. */
  unitsBehind: boolean;
}

export interface NpsYearRow {
  /** The calendar year the FY starts in (FY 2025–26 is 2025). */
  fyStart: number;
  label: string;
  self: number;
  employer: number;
  total: number;
  /** Everything contributed up to the end of this FY. */
  cumulative: number;
}

/** Identifies an account: the same name in two portfolios is two accounts. */
export function npsAccountKey(e: { portfolio_id: string; account: string }): string {
  return `${e.portfolio_id}\u0000${e.account}`;
}

export function isNpsSchemeClass(value: string): value is NpsSchemeClass {
  return (NPS_SCHEME_CLASSES as readonly string[]).includes(value);
}

export function valueNpsHolding(
  holding: NpsHoldingInput,
  navs: NavQuotes,
  today: string,
): NpsHoldingValue {
  const code = holding.scheme_code?.trim();
  const v = valueHolding(holding.units, 0, code ? navs.get(code) : undefined, today);
  return {
    value: v.value,
    dayChange: v.dayChange,
    nav: v.price,
    navDate: v.priceDate,
    stale: v.stale,
  };
}

function byAccount<T extends { portfolio_id: string; account: string }>(
  rows: readonly T[],
  account: string | null,
): T[] {
  return account === null ? [...rows] : rows.filter((r) => npsAccountKey(r) === account);
}

/**
 * The XIRR of contributions in, value out today. Null with nothing contributed, nothing
 * valued, or a scheme without a NAV (the value would be incomplete).
 */
export function npsXirr(
  contributions: readonly NpsContributionInput[],
  value: number,
  unpriced: number,
  today: string,
): number | null {
  if (unpriced > 0 || value <= 0 || contributions.length === 0) return null;
  const flows: CashFlow[] = contributions.map((c) => ({
    date: c.contribution_date,
    amount: -c.amount,
  }));
  return xirr([...flows, { date: today, amount: value }]);
}

function totalsOf(
  holdings: readonly NpsHoldingInput[],
  contributions: readonly NpsContributionInput[],
  navs: NavQuotes,
  today: string,
): NpsTotals {
  let value = 0;
  let dayChange = 0;
  let unpriced = 0;
  for (const h of holdings) {
    const v = valueNpsHolding(h, navs, today);
    if (v.value === null) {
      if (h.units > 0) unpriced++;
      continue;
    }
    value += v.value;
    dayChange += v.dayChange ?? 0;
  }
  const self = contributions
    .filter((c) => c.contributor === 'self')
    .reduce((s, c) => s + c.amount, 0);
  const employer = contributions
    .filter((c) => c.contributor !== 'self')
    .reduce((s, c) => s + c.amount, 0);
  const invested = self + employer;
  const pl = value - invested;
  return {
    value,
    invested,
    self,
    employer,
    pl,
    plPercent: plPercent(pl, invested),
    dayChange,
    unpriced,
    xirr: npsXirr(contributions, value, unpriced, today),
  };
}

/** Totals over the given portfolios, or one account ({@link npsAccountKey}). */
export function npsTotals(
  holdings: readonly NpsHoldingInput[],
  contributions: readonly NpsContributionInput[],
  navs: NavQuotes,
  portfolioIds: readonly string[],
  today: string,
  account: string | null = null,
): NpsTotals {
  return totalsOf(
    byAccount(inPortfolios(holdings, portfolioIds), account),
    byAccount(inPortfolios(contributions, portfolioIds), account),
    navs,
    today,
  );
}

/** The NPS value for the given portfolios (Overview and the snapshot). */
export function npsValue(
  holdings: readonly NpsHoldingInput[],
  navs: NavQuotes,
  portfolioIds: readonly string[],
  today: string,
): number {
  return totalsOf(inPortfolios(holdings, portfolioIds), [], navs, today).value;
}

/** Value per scheme class (E, C, G, A), in that order, over the holdings given. */
export function npsMix(
  holdings: readonly NpsHoldingInput[],
  navs: NavQuotes,
  today: string,
): NpsMix[] {
  const values = new Map<NpsSchemeClass, number>();
  for (const h of holdings) {
    const v = valueNpsHolding(h, navs, today).value;
    if (v === null || !isNpsSchemeClass(h.scheme_class)) continue;
    values.set(h.scheme_class, (values.get(h.scheme_class) ?? 0) + v);
  }
  const total = [...values.values()].reduce((s, v) => s + v, 0);
  return NPS_SCHEME_CLASSES.filter((c) => values.has(c)).map((c) => ({
    schemeClass: c,
    label: NPS_SCHEME_LABEL[c],
    value: values.get(c)!,
    percent: total ? (values.get(c)! / total) * 100 : 0,
  }));
}

/** The scheme mix over the given portfolios. */
export function npsMixIn(
  holdings: readonly NpsHoldingInput[],
  navs: NavQuotes,
  portfolioIds: readonly string[],
  today: string,
): NpsMix[] {
  return npsMix(inPortfolios(holdings, portfolioIds), navs, today);
}

function latest(dates: readonly (string | null)[]): string | null {
  return dates.reduce<string | null>(
    (max, d) => (d !== null && (max === null || d > max) ? d : max),
    null,
  );
}

/** One summary per account (with holdings or contributions), sorted by account then portfolio. */
export function npsByAccount(
  holdings: readonly NpsHoldingInput[],
  contributions: readonly NpsContributionInput[],
  navs: NavQuotes,
  portfolioIds: readonly string[],
  today: string,
): NpsAccountSummary[] {
  const scopedHoldings = inPortfolios(holdings, portfolioIds);
  const scopedContributions = inPortfolios(contributions, portfolioIds);
  const accounts = new Map<string, { portfolioId: string; account: string }>();
  for (const r of [...scopedHoldings, ...scopedContributions]) {
    accounts.set(npsAccountKey(r), { portfolioId: r.portfolio_id, account: r.account });
  }
  return [...accounts]
    .map(([key, a]) => {
      const h = byAccount(scopedHoldings, key);
      const c = byAccount(scopedContributions, key);
      const unitsAsOf = latest(h.map((x) => x.units_as_of));
      const lastContribution = latest(c.map((x) => x.contribution_date));
      return {
        ...totalsOf(h, c, navs, today),
        key,
        portfolioId: a.portfolioId,
        account: a.account,
        mix: npsMix(h, navs, today),
        unitsAsOf,
        lastContribution,
        unitsBehind:
          lastContribution !== null && (unitsAsOf === null || lastContribution > unitsAsOf),
      };
    })
    .sort(
      (a, b) => a.account.localeCompare(b.account) || a.portfolioId.localeCompare(b.portfolioId),
    );
}

/**
 * Contributions per financial year, newest first, from the first year with one to the last
 * (years in between at 0). `account` (an {@link npsAccountKey}) narrows it to one account.
 */
export function npsByFinancialYear(
  contributions: readonly NpsContributionInput[],
  portfolioIds: readonly string[],
  account: string | null = null,
): NpsYearRow[] {
  const rows = byAccount(inPortfolios(contributions, portfolioIds), account);
  if (rows.length === 0) return [];
  const years = rows.map((c) => fyStart(c.contribution_date));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const result: NpsYearRow[] = [];
  let cumulative = 0;
  for (let fy = first; fy <= last; fy++) {
    const inYear = rows.filter((c) => fyStart(c.contribution_date) === fy);
    const self = inYear.filter((c) => c.contributor === 'self').reduce((s, c) => s + c.amount, 0);
    const employer = inYear
      .filter((c) => c.contributor !== 'self')
      .reduce((s, c) => s + c.amount, 0);
    cumulative += self + employer;
    result.push({
      fyStart: fy,
      label: fyLabel(fy),
      self,
      employer,
      total: self + employer,
      cumulative,
    });
  }
  return result.reverse();
}

/** Contributions in the financial year of `today`. */
export function npsThisYear(
  contributions: readonly NpsContributionInput[],
  portfolioIds: readonly string[],
  today: string,
): { self: number; employer: number; total: number } {
  const fy = fyStart(today);
  const inYear = inPortfolios(contributions, portfolioIds).filter(
    (c) => fyStart(c.contribution_date) === fy,
  );
  const self = inYear.filter((c) => c.contributor === 'self').reduce((s, c) => s + c.amount, 0);
  const total = inYear.reduce((s, c) => s + c.amount, 0);
  return { self, employer: total - self, total };
}
