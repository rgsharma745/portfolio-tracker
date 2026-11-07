import { fyLabel, fyStart, inPortfolios } from './common';

/**
 * Public Provident Fund (docs/DATA_MODEL.md, "PPF"). Each row is a deposit (`investment`)
 * or the yearly interest credit (`interest`) on one account, and counts for the financial
 * year (April to March) of its date. The balance is investments + interest.
 *
 * PPF allows ₹500 to ₹1,50,000 of deposits per account and financial year. The app shows
 * those limits (room left, over-limit and below-minimum flags) but never enforces them.
 */

export type PpfEntryType = 'investment' | 'interest';

export const PPF_YEARLY_MAX = 150_000;
export const PPF_YEARLY_MIN = 500;

export interface PpfEntryInput {
  portfolio_id: string;
  account: string;
  /** `YYYY-MM-DD`. */
  entry_date: string;
  entry_type: string;
  amount: number;
}

export interface PpfTotals {
  invested: number;
  interest: number;
  /** invested + interest. */
  balance: number;
}

export interface PpfAccountSummary extends PpfTotals {
  /** {@link ppfAccountKey} of the account. */
  key: string;
  portfolioId: string;
  account: string;
  /** The latest entry date, or null when the account has no rows. */
  lastDate: string | null;
}

export interface PpfYearRow {
  /** The calendar year the FY starts in (FY 2025–26 is 2025). */
  fyStart: number;
  label: string;
  invested: number;
  interest: number;
  /** The balance at the end of this FY: everything up to and including it. */
  closingBalance: number;
  /** ₹1,50,000 minus this year's deposits (never below 0), or null over several accounts. */
  roomLeft: number | null;
  /** Accounts that took more than ₹1,50,000 this year. */
  overLimit: string[];
  /** Accounts that took less than ₹500 in a finished year (gap years included). */
  belowMinimum: string[];
}

const ZERO: PpfTotals = { invested: 0, interest: 0, balance: 0 };

/** Identifies an account: the same name in two portfolios is two accounts. */
export function ppfAccountKey(e: { portfolio_id: string; account: string }): string {
  return `${e.portfolio_id}\u0000${e.account}`;
}

function addEntry(t: PpfTotals, e: PpfEntryInput): PpfTotals {
  return e.entry_type === 'interest'
    ? { ...t, interest: t.interest + e.amount, balance: t.balance + e.amount }
    : { ...t, invested: t.invested + e.amount, balance: t.balance + e.amount };
}

function sum(entries: readonly PpfEntryInput[]): PpfTotals {
  return entries.reduce((t, e) => addEntry(t, e), ZERO);
}

/** Totals over the entries in the given portfolios. */
export function ppfTotals(
  entries: readonly PpfEntryInput[],
  portfolioIds: readonly string[],
): PpfTotals {
  return sum(inPortfolios(entries, portfolioIds));
}

/** The PPF balance (investments + interest) for the given portfolios. */
export function ppfBalance(
  entries: readonly PpfEntryInput[],
  portfolioIds: readonly string[],
): number {
  return ppfTotals(entries, portfolioIds).balance;
}

function groupByAccount<T extends PpfEntryInput>(entries: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const key = ppfAccountKey(e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return groups;
}

/** Totals per portfolio and account, sorted by account then portfolio. */
export function ppfByAccount(
  entries: readonly PpfEntryInput[],
  portfolioIds: readonly string[],
): PpfAccountSummary[] {
  return [...groupByAccount(inPortfolios(entries, portfolioIds))]
    .map(([key, rows]) => ({
      ...sum(rows),
      key,
      portfolioId: rows[0].portfolio_id,
      account: rows[0].account,
      lastDate: rows.reduce<string | null>(
        (latest, e) => (latest === null || e.entry_date > latest ? e.entry_date : latest),
        null,
      ),
    }))
    .sort(
      (a, b) => a.account.localeCompare(b.account) || a.portfolioId.localeCompare(b.portfolioId),
    );
}

/** Deposits per financial year of one account. */
function depositsByYear(rows: readonly PpfEntryInput[]): Map<number, number> {
  const byYear = new Map<number, number>();
  for (const e of rows) {
    if (e.entry_type !== 'interest') {
      const fy = fyStart(e.entry_date);
      byYear.set(fy, (byYear.get(fy) ?? 0) + e.amount);
    }
  }
  return byYear;
}

/**
 * One row per financial year, newest first, from the first year with an entry to the last
 * (years in between with no entries are included, at 0). `account` (an
 * {@link ppfAccountKey}) narrows it to one account; `today` decides which years are finished
 * for the ₹500 minimum.
 */
export function ppfByFinancialYear(
  entries: readonly PpfEntryInput[],
  portfolioIds: readonly string[],
  today: string,
  account: string | null = null,
): PpfYearRow[] {
  const rows = inPortfolios(entries, portfolioIds).filter(
    (e) => account === null || ppfAccountKey(e) === account,
  );
  if (rows.length === 0) return [];

  const years = rows.map((e) => fyStart(e.entry_date));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const currentFy = fyStart(today);
  const accounts = [...groupByAccount(rows)].map(([, list]) => ({
    name: list[0].account,
    firstFy: Math.min(...list.map((e) => fyStart(e.entry_date))),
    deposits: depositsByYear(list),
  }));
  const single = accounts.length === 1;

  const result: PpfYearRow[] = [];
  let balance = 0;
  for (let fy = first; fy <= last; fy++) {
    const totals = sum(rows.filter((e) => fyStart(e.entry_date) === fy));
    balance += totals.balance;
    result.push({
      fyStart: fy,
      label: fyLabel(fy),
      invested: totals.invested,
      interest: totals.interest,
      closingBalance: balance,
      roomLeft: single ? Math.max(PPF_YEARLY_MAX - totals.invested, 0) : null,
      overLimit: accounts
        .filter((a) => (a.deposits.get(fy) ?? 0) > PPF_YEARLY_MAX)
        .map((a) => a.name),
      belowMinimum: accounts
        .filter((a) => fy >= a.firstFy && fy < currentFy)
        .filter((a) => (a.deposits.get(fy) ?? 0) < PPF_YEARLY_MIN)
        .map((a) => a.name),
    });
  }
  return result.reverse();
}

/** Deposits made in the financial year of `today`, and the room left when it is one account. */
export function ppfThisYear(
  entries: readonly PpfEntryInput[],
  portfolioIds: readonly string[],
  today: string,
): { invested: number; roomLeft: number | null; accounts: number } {
  const fy = fyStart(today);
  const scoped = inPortfolios(entries, portfolioIds);
  const invested = scoped
    .filter((e) => e.entry_type !== 'interest' && fyStart(e.entry_date) === fy)
    .reduce((s, e) => s + e.amount, 0);
  const accounts = groupByAccount(scoped).size;
  return {
    invested,
    roomLeft: accounts === 1 ? Math.max(PPF_YEARLY_MAX - invested, 0) : null,
    accounts,
  };
}
