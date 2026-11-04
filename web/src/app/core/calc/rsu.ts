import { inPortfolios } from './common';
import { PriceQuotes } from './stocks';

/**
 * RSU grants, priced in USD at the symbol's latest close (docs/DATA_MODEL.md):
 * - vested value = units vested * price
 * - sellable = units vested - units sold for tax; pending vesting = granted - vested
 * - total value = units granted * price; after tax = total value * (1 - tax rate)
 * - INR = USD * USDINR
 */

export interface RsuGrantInput {
  portfolio_id: string;
  symbol: string;
  units_granted: number;
  units_vested: number;
  units_sold_for_tax: number;
  tax_rate: number;
}

export interface RsuUnits {
  granted: number;
  vested: number;
  soldForTax: number;
  sellable: number;
  pending: number;
}

/** USD and INR values; null without a price (or, for INR, without a USDINR rate). */
export interface RsuValues {
  totalUsd: number | null;
  afterTaxUsd: number | null;
  afterTaxInr: number | null;
  vestedUsd: number | null;
  vestedInr: number | null;
}

export interface RsuValuation extends RsuValues {
  units: RsuUnits;
  price: number | null;
  priceDate: string | null;
}

export interface RsuTotals {
  units: RsuUnits;
  totalUsd: number;
  afterTaxUsd: number;
  vestedUsd: number;
  /** Null when there are priced grants but no USDINR rate. */
  afterTaxInr: number | null;
  vestedInr: number | null;
  count: number;
  /** Grants without a price, left out of the values (not the units). */
  unpriced: number;
}

export function rsuUnits(grant: RsuGrantInput): RsuUnits {
  return {
    granted: grant.units_granted,
    vested: grant.units_vested,
    soldForTax: grant.units_sold_for_tax,
    sellable: grant.units_vested - grant.units_sold_for_tax,
    pending: grant.units_granted - grant.units_vested,
  };
}

export function valueRsuGrant(
  grant: RsuGrantInput,
  prices: PriceQuotes,
  usdInr: number | null,
): RsuValuation {
  const units = rsuUnits(grant);
  const quote = prices.get(grant.symbol);
  if (!quote) {
    return {
      units,
      price: null,
      priceDate: null,
      totalUsd: null,
      afterTaxUsd: null,
      afterTaxInr: null,
      vestedUsd: null,
      vestedInr: null,
    };
  }
  const totalUsd = units.granted * quote.price;
  const afterTaxUsd = totalUsd * (1 - grant.tax_rate);
  const vestedUsd = units.vested * quote.price;
  const inr = (usd: number) => (usdInr === null ? null : usd * usdInr);
  return {
    units,
    price: quote.price,
    priceDate: quote.date,
    totalUsd,
    afterTaxUsd,
    afterTaxInr: inr(afterTaxUsd),
    vestedUsd,
    vestedInr: inr(vestedUsd),
  };
}

/** Totals for the grants in the given portfolios. */
export function rsuTotals(
  grants: readonly RsuGrantInput[],
  prices: PriceQuotes,
  usdInr: number | null,
  portfolioIds: readonly string[],
): RsuTotals {
  const totals: RsuTotals = {
    units: { granted: 0, vested: 0, soldForTax: 0, sellable: 0, pending: 0 },
    totalUsd: 0,
    afterTaxUsd: 0,
    vestedUsd: 0,
    afterTaxInr: 0,
    vestedInr: 0,
    count: 0,
    unpriced: 0,
  };
  for (const grant of inPortfolios(grants, portfolioIds)) {
    const v = valueRsuGrant(grant, prices, usdInr);
    totals.count++;
    for (const key of Object.keys(totals.units) as (keyof RsuUnits)[]) {
      totals.units[key] += v.units[key];
    }
    if (v.price === null) {
      totals.unpriced++;
      continue;
    }
    totals.totalUsd += v.totalUsd ?? 0;
    totals.afterTaxUsd += v.afterTaxUsd ?? 0;
    totals.vestedUsd += v.vestedUsd ?? 0;
  }
  const priced = totals.count > totals.unpriced;
  totals.afterTaxInr = usdInr === null ? (priced ? null : 0) : totals.afterTaxUsd * usdInr;
  totals.vestedInr = usdInr === null ? (priced ? null : 0) : totals.vestedUsd * usdInr;
  return totals;
}
