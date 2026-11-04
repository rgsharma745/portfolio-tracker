import { Currency } from '../../shared/format/money';
import {
  Quote,
  Totals,
  Valuation,
  convertValuation,
  inPortfolios,
  sumValuations,
  valueHolding,
} from './common';

/**
 * Stocks: value = quantity * last close in the stock's own currency; P&L and day change as
 * for funds. USD amounts convert to INR at the latest USDINR rate. The INR day change uses
 * today's rate only (the move in the exchange rate itself is not counted as day change).
 */

export type Market = 'IN' | 'US';

export interface StockHoldingInput {
  portfolio_id: string;
  market: string;
  symbol: string;
  currency: string;
  quantity: number;
  invested: number;
}

export interface PriceRow {
  symbol: string;
  close: number;
  price_date: string;
  prev_close: number | null;
}

export interface FxRow {
  pair: string;
  rate: number;
  rate_date: string;
  prev_rate: number | null;
}

export type PriceQuotes = ReadonlyMap<string, Quote>;

/** Indexes `stock_price_latest` rows by symbol (also used for RSU prices). */
export function priceQuotes(rows: readonly PriceRow[]): PriceQuotes {
  return new Map(
    rows.map((r) => [r.symbol, { price: r.close, date: r.price_date, prevPrice: r.prev_close }]),
  );
}

/** The USDINR rate from `fx_latest`, or null if the job has not stored one yet. */
export function usdInrRate(rows: readonly FxRow[]): number | null {
  return rows.find((r) => r.pair === 'USDINR')?.rate ?? null;
}

/** Converts an amount to INR; null when it is in USD and there is no rate. */
export function toInr(amount: number, currency: Currency, usdInr: number | null): number | null {
  if (currency === 'INR') return amount;
  return usdInr === null ? null : amount * usdInr;
}

export interface StockValuation {
  currency: Currency;
  /** In the stock's own currency. */
  native: Valuation;
  /** In INR; money fields are null for a USD stock when there is no USDINR rate. */
  inr: Valuation;
}

export function valueStockHolding(
  holding: StockHoldingInput,
  prices: PriceQuotes,
  usdInr: number | null,
  today: string,
): StockValuation {
  const currency = asCurrency(holding.currency);
  const native = valueHolding(
    holding.quantity,
    holding.invested,
    prices.get(holding.symbol),
    today,
  );
  if (currency === 'INR') return { currency, native, inr: native };
  const inr = usdInr === null ? unpriced(native) : convertValuation(native, usdInr);
  return { currency, native, inr };
}

export interface StockTotalsOptions {
  /** Only one market (the India or US tab). Default: both. */
  market?: Market;
  /** Currency of the totals (the USD toggle). Default: INR. */
  currency?: Currency;
}

/** Totals for the holdings in the given portfolios. */
export function stockTotals(
  holdings: readonly StockHoldingInput[],
  prices: PriceQuotes,
  usdInr: number | null,
  portfolioIds: readonly string[],
  today: string,
  options: StockTotalsOptions = {},
): Totals {
  const rows = inPortfolios(holdings, portfolioIds).filter(
    (h) => !options.market || h.market === options.market,
  );
  return sumValuations(
    rows.map((h) => {
      const v = valueStockHolding(h, prices, usdInr, today);
      if (options.currency !== 'USD') return v.inr;
      if (v.currency === 'USD') return v.native;
      return usdInr === null ? unpriced(v.native) : convertValuation(v.native, 1 / usdInr);
    }),
  );
}

function unpriced(v: Valuation): Valuation {
  return { ...v, value: null, pl: null, plPercent: null, dayChange: null, price: null };
}

function asCurrency(currency: string): Currency {
  return currency === 'USD' ? 'USD' : 'INR';
}
