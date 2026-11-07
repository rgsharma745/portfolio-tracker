import { Totals, daysBetween, plPercent } from '../../core/calc/common';

/** One row of the Overview summary table: MF + stocks (INR) for one portfolio. */
export interface PortfolioSummaryRow {
  id: string;
  name: string;
  holdings: number;
  invested: number;
  value: number;
  pl: number;
  plPercent: number;
  dayChange: number;
}

/** Combines MF and stock totals (both INR) into one summary row. */
export function summaryRow(
  id: string,
  name: string,
  mf: Totals,
  stocks: Totals,
): PortfolioSummaryRow {
  const invested = mf.invested + stocks.invested;
  const value = mf.value + stocks.value;
  return {
    id,
    name,
    holdings: mf.count + stocks.count,
    invested,
    value,
    pl: value - invested,
    plPercent: plPercent(value - invested, invested),
    dayChange: mf.dayChange + stocks.dayChange,
  };
}

/** The family total row: the sum of the portfolio rows. */
export function totalRow(rows: readonly PortfolioSummaryRow[]): PortfolioSummaryRow {
  const sum = (key: 'holdings' | 'invested' | 'value' | 'dayChange') =>
    rows.reduce((total, r) => total + r[key], 0);
  const invested = sum('invested');
  const value = sum('value');
  return {
    id: 'total',
    name: 'Family total',
    holdings: sum('holdings'),
    invested,
    value,
    pl: value - invested,
    plPercent: plPercent(value - invested, invested),
    dayChange: sum('dayChange'),
  };
}

export interface AllocationPart {
  key: string;
  label: string;
  value: number;
  /** 0 to 100. */
  share: number;
}

/** Splits a whole into its positive parts with their shares (zero or negative parts drop). */
export function allocation(
  parts: readonly { key: string; label: string; value: number }[],
): AllocationPart[] {
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((sum, p) => sum + p.value, 0);
  return positive.map((p) => ({ ...p, share: total ? (p.value / total) * 100 : 0 }));
}

export type HistoryRange = '1M' | '6M' | '1Y' | 'All';

export const HISTORY_RANGE_DAYS: Record<HistoryRange, number | null> = {
  '1M': 31,
  '6M': 183,
  '1Y': 366,
  All: null,
};

export interface HistoryPoint {
  date: string;
  value: number;
}

/** What the history chart plots: MF + stocks, the PF balance or the PPF balance. */
export type HistorySeries = 'combined' | 'pf' | 'ppf';

/**
 * Value per day for the given portfolios, oldest first, limited to the range: MF + stocks
 * (`combined`), the PF balance (`pf`) or the PPF balance (`ppf`). Days are summed across
 * portfolios. Days recorded before PF or PPF existed hold 0; those series start at the first
 * day above 0.
 */
export function historySeries(
  snapshots: readonly {
    portfolio_id: string;
    snap_date: string;
    mf_value: number;
    stocks_value: number;
    pf_balance?: number;
    ppf_balance?: number;
  }[],
  portfolioIds: readonly string[],
  range: HistoryRange,
  today: string,
  series: HistorySeries = 'combined',
): HistoryPoint[] {
  const ids = new Set(portfolioIds);
  const days = HISTORY_RANGE_DAYS[range];
  const byDate = new Map<string, number>();
  for (const s of snapshots) {
    if (!ids.has(s.portfolio_id)) continue;
    if (days !== null && daysBetween(s.snap_date, today) > days) continue;
    const value =
      series === 'pf'
        ? (s.pf_balance ?? 0)
        : series === 'ppf'
          ? (s.ppf_balance ?? 0)
          : s.mf_value + s.stocks_value;
    byDate.set(s.snap_date, (byDate.get(s.snap_date) ?? 0) + value);
  }
  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  if (series === 'combined') return points;
  const first = points.findIndex((p) => p.value > 0);
  return first === -1 ? [] : points.slice(first);
}
