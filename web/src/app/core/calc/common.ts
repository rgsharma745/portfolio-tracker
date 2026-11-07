/**
 * Shared building blocks for the calculations in docs/DATA_MODEL.md ("Calculations").
 * Values stay unrounded numbers; rounding happens only in the display layer.
 * Dates are ISO strings (`YYYY-MM-DD`) and are compared as calendar days, not instants.
 */

/** A NAV or price older than this many days gets a "stale" badge. */
export const STALE_AFTER_DAYS = 4;

/** Latest and previous price of one fund, stock or FX pair (from the `*_latest` tables). */
export interface Quote {
  price: number;
  date: string;
  /** The previous stored price, or null for a brand-new row (day change is then 0). */
  prevPrice: number | null;
}

/** Value of one holding. All money fields are null when there is no price to value it. */
export interface Valuation {
  invested: number;
  value: number | null;
  pl: number | null;
  plPercent: number | null;
  dayChange: number | null;
  price: number | null;
  priceDate: string | null;
  stale: boolean;
}

/**
 * Totals over several holdings. `value`, `invested`, `pl` and `dayChange` cover priced
 * holdings only, so `value - invested = pl` always holds. Holdings without a price are
 * counted in `unpriced` and their cost in `unpricedInvested`, for the UI to flag.
 */
export interface Totals {
  value: number;
  invested: number;
  pl: number;
  plPercent: number;
  dayChange: number;
  count: number;
  unpriced: number;
  unpricedInvested: number;
}

export const EMPTY_TOTALS: Totals = {
  value: 0,
  invested: 0,
  pl: 0,
  plPercent: 0,
  dayChange: 0,
  count: 0,
  unpriced: 0,
  unpricedInvested: 0,
};

/** P&L as a percentage of the amount invested; 0 when nothing was invested. */
export function plPercent(pl: number, invested: number): number {
  return invested ? (pl / invested) * 100 : 0;
}

/** Values `quantity` units bought for `invested` at the quote's price. */
export function valueHolding(
  quantity: number,
  invested: number,
  quote: Quote | undefined,
  today: string,
): Valuation {
  if (!quote) {
    return {
      invested,
      value: null,
      pl: null,
      plPercent: null,
      dayChange: null,
      price: null,
      priceDate: null,
      stale: false,
    };
  }
  const value = quantity * quote.price;
  const pl = value - invested;
  return {
    invested,
    value,
    pl,
    plPercent: plPercent(pl, invested),
    dayChange: quantity * (quote.price - (quote.prevPrice ?? quote.price)),
    price: quote.price,
    priceDate: quote.date,
    stale: isStale(quote.date, today),
  };
}

/** Converts a valuation's money fields with `rate` (for example USD to INR). */
export function convertValuation(valuation: Valuation, rate: number): Valuation {
  const times = (n: number | null) => (n === null ? null : n * rate);
  return {
    ...valuation,
    invested: valuation.invested * rate,
    value: times(valuation.value),
    pl: times(valuation.pl),
    dayChange: times(valuation.dayChange),
    price: times(valuation.price),
  };
}

/** Adds up valuations. A null valuation (for example no FX rate) counts as unpriced. */
export function sumValuations(valuations: readonly Valuation[]): Totals {
  const totals = { ...EMPTY_TOTALS };
  for (const v of valuations) {
    totals.count++;
    if (v.value === null) {
      totals.unpriced++;
      totals.unpricedInvested += v.invested;
      continue;
    }
    totals.value += v.value;
    totals.invested += v.invested;
    totals.dayChange += v.dayChange ?? 0;
  }
  totals.pl = totals.value - totals.invested;
  totals.plPercent = plPercent(totals.pl, totals.invested);
  return totals;
}

/**
 * Portfolio ids that totals include: the selected portfolio, or every active portfolio
 * for "All" (`scope` null). An unknown or inactive selection falls back to All.
 */
export function scopeIds(
  portfolios: readonly { id: string; is_active: boolean }[],
  scope: string | null,
): string[] {
  const active = portfolios.filter((p) => p.is_active).map((p) => p.id);
  return scope && active.includes(scope) ? [scope] : active;
}

/** Rows that belong to one of the given portfolios. */
export function inPortfolios<T extends { portfolio_id: string }>(
  rows: readonly T[],
  portfolioIds: readonly string[],
): T[] {
  const ids = new Set(portfolioIds);
  return rows.filter((row) => ids.has(row.portfolio_id));
}

/** Whether a price dated `date` is older than {@link STALE_AFTER_DAYS} on `today`. */
export function isStale(date: string, today: string): boolean {
  return daysBetween(date, today) > STALE_AFTER_DAYS;
}

const DAY_MS = 86_400_000;

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Today's date in the browser's time zone, as `YYYY-MM-DD`. */
export function localIsoDate(now: Date = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Number of days in a month (`month` is 1 to 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Splits `YYYY-MM-DD` into numbers. */
export function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
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

function toUtc(date: string): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
