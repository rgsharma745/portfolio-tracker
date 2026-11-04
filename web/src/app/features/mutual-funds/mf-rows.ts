import { Valuation, inPortfolios } from '../../core/calc/common';
import { NavQuotes, valueMfHolding } from '../../core/calc/mf';
import type { MfHolding } from '../../core/data/holdings.service';
import { CsvColumn } from '../../shared/format/csv';

/** One row of the funds list: flat fields for sorting, plus the valuation for totals. */
export interface MfRow {
  id: string;
  name: string;
  code: string | null;
  folio: string | null;
  portfolio: string;
  units: number;
  invested: number;
  nav: number | null;
  navDate: string | null;
  value: number | null;
  pl: number | null;
  plPercent: number | null;
  dayChange: number | null;
  stale: boolean;
  valuation: Valuation;
  holding: MfHolding;
}

export function buildMfRows(
  holdings: readonly MfHolding[],
  navs: NavQuotes,
  portfolioNames: ReadonlyMap<string, string>,
  portfolioIds: readonly string[],
  today: string,
): MfRow[] {
  return inPortfolios(holdings, portfolioIds).map((h) => {
    const v = valueMfHolding(h, navs, today);
    return {
      id: h.id,
      name: h.scheme_name,
      code: h.scheme_code,
      folio: h.folio,
      portfolio: portfolioNames.get(h.portfolio_id) ?? '',
      units: h.units,
      invested: h.invested,
      nav: v.price,
      navDate: v.priceDate,
      value: v.value,
      pl: v.pl,
      plPercent: v.plPercent,
      dayChange: v.dayChange,
      stale: v.stale,
      valuation: v,
      holding: h,
    };
  });
}

export const MF_CSV_COLUMNS: readonly CsvColumn<MfRow>[] = [
  { header: 'Portfolio', value: (r) => r.portfolio },
  { header: 'Fund', value: (r) => r.name },
  { header: 'Scheme code', value: (r) => r.code },
  { header: 'Folio', value: (r) => r.folio },
  { header: 'Units', value: (r) => r.units },
  { header: 'Invested (INR)', value: (r) => r.invested },
  { header: 'NAV', value: (r) => r.nav },
  { header: 'NAV date', value: (r) => r.navDate },
  { header: 'Current value (INR)', value: (r) => r.value },
  { header: 'P&L (INR)', value: (r) => r.pl },
  { header: 'P&L %', value: (r) => r.plPercent },
  { header: 'Today (INR)', value: (r) => r.dayChange },
];
