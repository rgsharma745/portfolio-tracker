import { Quote, Totals, Valuation, inPortfolios, sumValuations, valueHolding } from './common';

/**
 * Mutual funds: value = units * NAV, P&L = value - invested,
 * day change = units * (NAV - previous NAV). See docs/DATA_MODEL.md.
 */

export interface MfHoldingInput {
  portfolio_id: string;
  scheme_code: string | null;
  units: number;
  invested: number;
}

export interface NavRow {
  scheme_code: string;
  nav: number;
  nav_date: string;
  prev_nav: number | null;
}

export type NavQuotes = ReadonlyMap<string, Quote>;

/** Indexes `mf_nav_latest` rows by scheme code. */
export function navQuotes(rows: readonly NavRow[]): NavQuotes {
  return new Map(
    rows.map((r) => [r.scheme_code, { price: r.nav, date: r.nav_date, prevPrice: r.prev_nav }]),
  );
}

export function valueMfHolding(holding: MfHoldingInput, navs: NavQuotes, today: string): Valuation {
  const code = holding.scheme_code?.trim();
  return valueHolding(holding.units, holding.invested, code ? navs.get(code) : undefined, today);
}

/** Totals for the holdings in the given portfolios (one portfolio, or all active ones). */
export function mfTotals(
  holdings: readonly MfHoldingInput[],
  navs: NavQuotes,
  portfolioIds: readonly string[],
  today: string,
): Totals {
  return sumValuations(
    inPortfolios(holdings, portfolioIds).map((h) => valueMfHolding(h, navs, today)),
  );
}
