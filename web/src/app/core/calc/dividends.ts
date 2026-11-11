import { fyLabel, fyStart, inPortfolios } from './common';

/**
 * Dividends received (docs/DATA_MODEL.md, "Dividends"). Each row is one credit and counts for
 * the financial year (April to March) of its payment date. `amount_inr` is what was credited
 * and is what gets added up; US rows also keep `amount_usd`, the dollar amount paid, because
 * the USD/INR rate on the day of payment is not today's.
 */

export type DividendMarket = 'IN' | 'US';

export interface DividendInput {
  portfolio_id: string;
  market: string;
  symbol: string;
  /** `YYYY-MM-DD`. */
  paid_on: string;
  amount_inr: number;
  amount_usd: number | null;
}

export interface DividendYearRow {
  /** The calendar year the FY starts in (FY 2025–26 is 2025). */
  fyStart: number;
  label: string;
  /** From Indian stocks, ₹. */
  india: number;
  /** From US stocks, ₹ as credited. */
  us: number;
  /** From US stocks, $. */
  usd: number;
  /** india + us. */
  total: number;
  count: number;
}

export interface DividendSymbolRow {
  /** {@link dividendSymbolKey}. */
  key: string;
  market: DividendMarket;
  symbol: string;
  inr: number;
  /** Dollars paid, or null for an Indian symbol. */
  usd: number | null;
  count: number;
  /** The latest payment date. */
  lastPaid: string;
}

export interface DividendTotals {
  thisYear: number;
  lastYear: number;
  allTime: number;
}

export function dividendMarket(market: string): DividendMarket {
  return market === 'US' ? 'US' : 'IN';
}

/** Identifies a symbol: the same ticker in two markets is two companies. */
export function dividendSymbolKey(d: { market: string; symbol: string }): string {
  return `${dividendMarket(d.market)}:${d.symbol}`;
}

/** One row per financial year that has a dividend, newest first. */
export function dividendsByFinancialYear(
  rows: readonly DividendInput[],
  portfolioIds: readonly string[],
): DividendYearRow[] {
  const years = new Map<number, DividendYearRow>();
  for (const d of inPortfolios(rows, portfolioIds)) {
    const fy = fyStart(d.paid_on);
    const y = years.get(fy) ?? {
      fyStart: fy,
      label: fyLabel(fy),
      india: 0,
      us: 0,
      usd: 0,
      total: 0,
      count: 0,
    };
    const isUs = dividendMarket(d.market) === 'US';
    years.set(fy, {
      ...y,
      india: y.india + (isUs ? 0 : d.amount_inr),
      us: y.us + (isUs ? d.amount_inr : 0),
      usd: y.usd + (isUs ? (d.amount_usd ?? 0) : 0),
      total: y.total + d.amount_inr,
      count: y.count + 1,
    });
  }
  return [...years.values()].sort((a, b) => b.fyStart - a.fyStart);
}

/**
 * Totals per symbol, largest first (then by symbol). `fy` narrows it to one financial year;
 * null covers every year.
 */
export function dividendsBySymbol(
  rows: readonly DividendInput[],
  portfolioIds: readonly string[],
  fy: number | null,
): DividendSymbolRow[] {
  const symbols = new Map<string, DividendSymbolRow>();
  for (const d of inPortfolios(rows, portfolioIds)) {
    if (fy !== null && fyStart(d.paid_on) !== fy) continue;
    const key = dividendSymbolKey(d);
    const market = dividendMarket(d.market);
    const s = symbols.get(key) ?? {
      key,
      market,
      symbol: d.symbol,
      inr: 0,
      usd: market === 'US' ? 0 : null,
      count: 0,
      lastPaid: d.paid_on,
    };
    symbols.set(key, {
      ...s,
      inr: s.inr + d.amount_inr,
      usd: s.usd === null ? null : s.usd + (d.amount_usd ?? 0),
      count: s.count + 1,
      lastPaid: d.paid_on > s.lastPaid ? d.paid_on : s.lastPaid,
    });
  }
  return [...symbols.values()].sort(
    (a, b) => b.inr - a.inr || a.symbol.localeCompare(b.symbol) || a.key.localeCompare(b.key),
  );
}

/** ₹ received in the financial year of `today`, the year before, and in all. */
export function dividendTotals(
  rows: readonly DividendInput[],
  portfolioIds: readonly string[],
  today: string,
): DividendTotals {
  const current = fyStart(today);
  return inPortfolios(rows, portfolioIds).reduce(
    (t, d) => {
      const fy = fyStart(d.paid_on);
      return {
        thisYear: t.thisYear + (fy === current ? d.amount_inr : 0),
        lastYear: t.lastYear + (fy === current - 1 ? d.amount_inr : 0),
        allTime: t.allTime + d.amount_inr,
      };
    },
    { thisYear: 0, lastYear: 0, allTime: 0 },
  );
}
