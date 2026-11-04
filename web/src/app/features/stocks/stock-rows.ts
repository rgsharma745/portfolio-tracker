import { Valuation, inPortfolios } from '../../core/calc/common';
import { Market, PriceQuotes, valueStockHolding } from '../../core/calc/stocks';
import type { StockHolding } from '../../core/data/holdings.service';
import { CsvColumn } from '../../shared/format/csv';
import { Currency } from '../../shared/format/money';

/** One stock in the list, in the display currency, with the INR value alongside. */
export interface StockRow {
  id: string;
  name: string;
  symbol: string;
  companyName: string | null;
  portfolio: string;
  currency: Currency;
  quantity: number;
  avgPrice: number | null;
  invested: number;
  price: number | null;
  priceDate: string | null;
  value: number | null;
  /** INR value, shown under a USD value. */
  valueInr: number | null;
  pl: number | null;
  plPercent: number | null;
  dayChange: number | null;
  stale: boolean;
  valuation: Valuation;
  holding: StockHolding;
}

/**
 * Rows for one market tab. US stocks show in USD unless `inInr` is set (the toggle); Indian
 * stocks are always INR. Without a USDINR rate, INR values of US stocks are empty.
 */
export function buildStockRows(
  holdings: readonly StockHolding[],
  prices: PriceQuotes,
  usdInr: number | null,
  portfolioNames: ReadonlyMap<string, string>,
  portfolioIds: readonly string[],
  today: string,
  market: Market,
  inInr: boolean,
): StockRow[] {
  return inPortfolios(holdings, portfolioIds)
    .filter((h) => h.market === market)
    .map((h) => {
      const v = valueStockHolding(h, prices, usdInr, today);
      const shown = inInr ? v.inr : v.native;
      const currency: Currency = inInr ? 'INR' : v.currency;
      const avgRate = inInr && v.currency === 'USD' ? usdInr : 1;
      return {
        id: h.id,
        name: h.symbol,
        symbol: h.symbol,
        companyName: h.name,
        portfolio: portfolioNames.get(h.portfolio_id) ?? '',
        currency,
        quantity: h.quantity,
        avgPrice: h.avg_price === null || avgRate === null ? null : h.avg_price * avgRate,
        invested: shown.invested,
        price: shown.price,
        priceDate: shown.priceDate,
        value: shown.value,
        valueInr: v.inr.value,
        pl: shown.pl,
        plPercent: shown.plPercent,
        dayChange: shown.dayChange,
        stale: shown.stale,
        valuation: shown,
        holding: h,
      };
    });
}

export const STOCK_CSV_COLUMNS: readonly CsvColumn<StockRow>[] = [
  { header: 'Portfolio', value: (r) => r.portfolio },
  { header: 'Symbol', value: (r) => r.symbol },
  { header: 'Name', value: (r) => r.companyName },
  { header: 'Currency', value: (r) => r.currency },
  { header: 'Quantity', value: (r) => r.quantity },
  { header: 'Average price', value: (r) => r.avgPrice },
  { header: 'Invested', value: (r) => r.invested },
  { header: 'Price', value: (r) => r.price },
  { header: 'Price date', value: (r) => r.priceDate },
  { header: 'Current value', value: (r) => r.value },
  { header: 'Current value (INR)', value: (r) => r.valueInr },
  { header: 'P&L', value: (r) => r.pl },
  { header: 'P&L %', value: (r) => r.plPercent },
  { header: 'Today', value: (r) => r.dayChange },
];
