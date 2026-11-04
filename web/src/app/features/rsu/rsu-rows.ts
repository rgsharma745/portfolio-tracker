import { inPortfolios } from '../../core/calc/common';
import { valueRsuGrant } from '../../core/calc/rsu';
import { PriceQuotes } from '../../core/calc/stocks';
import type { RsuGrant } from '../../core/data/holdings.service';

export interface RsuRow {
  id: string;
  name: string;
  symbol: string;
  portfolio: string;
  grantDate: string | null;
  granted: number;
  vested: number;
  soldForTax: number;
  sellable: number;
  pending: number;
  /** Percent, for display. */
  taxPercent: number;
  price: number | null;
  vestedInr: number | null;
  afterTaxInr: number | null;
  grant: RsuGrant;
}

export function buildRsuRows(
  grants: readonly RsuGrant[],
  prices: PriceQuotes,
  usdInr: number | null,
  portfolioNames: ReadonlyMap<string, string>,
  portfolioIds: readonly string[],
): RsuRow[] {
  return inPortfolios(grants, portfolioIds).map((g) => {
    const v = valueRsuGrant(g, prices, usdInr);
    return {
      id: g.id,
      name: g.grant_label,
      symbol: g.symbol,
      portfolio: portfolioNames.get(g.portfolio_id) ?? '',
      grantDate: g.grant_date,
      ...v.units,
      taxPercent: g.tax_rate * 100,
      price: v.price,
      vestedInr: v.vestedInr,
      afterTaxInr: v.afterTaxInr,
      grant: g,
    };
  });
}

/** The price to show on the "Current price" card: one symbol's price, or null if mixed. */
export function singlePrice(
  rows: readonly RsuRow[],
): { symbol: string; price: number | null } | null {
  const symbols = new Set(rows.map((r) => r.symbol));
  if (symbols.size !== 1) return null;
  return { symbol: rows[0].symbol, price: rows[0].price };
}
