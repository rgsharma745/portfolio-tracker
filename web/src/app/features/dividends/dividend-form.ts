import { DividendMarket, dividendMarket } from '../../core/calc/dividends';
import type { Dividend, DividendInput } from '../../core/data/dividends.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

export const SYMBOL_MAX = 20;

export interface DividendForm {
  portfolioId: string;
  market: DividendMarket;
  symbol: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** ₹ credited. */
  amountInr: string;
  /** $ paid; US only. */
  amountUsd: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A new row dated today. */
export function emptyDividendForm(
  portfolioId: string,
  today: string,
  market: DividendMarket = 'IN',
): DividendForm {
  return { portfolioId, market, symbol: '', date: today, amountInr: '', amountUsd: '' };
}

export function dividendFormFrom(d: Dividend): DividendForm {
  return {
    portfolioId: d.portfolio_id,
    market: dividendMarket(d.market),
    symbol: d.symbol,
    date: d.paid_on,
    amountInr: numberInputText(d.amount_inr),
    amountUsd: numberInputText(d.amount_usd),
  };
}

/** Symbols are stored trimmed and upper-case (the database checks it). */
export function normalizeSymbol(text: string): string {
  return text.trim().toUpperCase();
}

function symbolError(symbol: string, market: DividendMarket): string | undefined {
  if (!symbol) return `Enter the symbol, e.g. ${market === 'US' ? 'MSFT' : 'ITC'}.`;
  if (symbol.length > SYMBOL_MAX) return `Use at most ${SYMBOL_MAX} characters.`;
  return undefined;
}

function positive(value: number | null, what: string): string | undefined {
  return nonNegative(value, what) ?? (value === 0 ? 'Must be more than zero.' : undefined);
}

export function validateDividendForm(form: DividendForm): {
  errors: FormErrors<DividendForm>;
  value: DividendInput | null;
} {
  const symbol = normalizeSymbol(form.symbol);
  const isUs = form.market === 'US';
  const inr = parseDecimal(form.amountInr);
  const usd = isUs ? parseDecimal(form.amountUsd) : null;
  const errors = onlyErrors<DividendForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    symbol: symbolError(symbol, form.market),
    date: ISO_DATE.test(form.date) ? undefined : 'Pick the date.',
    amountInr: positive(inr, 'the amount'),
    amountUsd: isUs ? positive(usd, 'the amount') : undefined,
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      market: form.market,
      symbol,
      paid_on: form.date,
      amount_inr: inr as number,
      amount_usd: usd,
    },
  };
}

/** Known symbols matching what was typed: those starting with it first, then the rest containing it. */
export function matchSymbols(symbols: readonly string[], query: string): string[] {
  const q = normalizeSymbol(query);
  if (!q) return [...symbols];
  const starts = symbols.filter((s) => s.startsWith(q));
  const contains = symbols.filter((s) => !s.startsWith(q) && s.includes(q));
  return [...starts, ...contains];
}

/** ₹ for a dollar amount at today's rate, as a hint (rounded to the rupee), or null. */
export function inrAtRate(amountUsd: string, usdInr: number | null): number | null {
  const usd = parseDecimal(amountUsd);
  if (usd === null || Number.isNaN(usd) || usd <= 0 || usdInr === null) return null;
  return Math.round(usd * usdInr);
}
