import { Market } from '../../core/calc/stocks';
import type { StockHolding, StockHoldingInput } from '../../core/data/holdings.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import {
  FormErrors,
  nonNegative,
  onlyErrors,
  optionalNonNegative,
} from '../../shared/format/validation';

export interface StockForm {
  portfolioId: string;
  market: Market;
  symbol: string;
  name: string;
  quantity: string;
  avgPrice: string;
  invested: string;
}

export function emptyStockForm(portfolioId: string, market: Market): StockForm {
  return { portfolioId, market, symbol: '', name: '', quantity: '', avgPrice: '', invested: '' };
}

export function stockFormFrom(h: StockHolding): StockForm {
  return {
    portfolioId: h.portfolio_id,
    market: h.market === 'US' ? 'US' : 'IN',
    symbol: h.symbol,
    name: h.name ?? '',
    quantity: numberInputText(h.quantity),
    avgPrice: numberInputText(h.avg_price),
    invested: numberInputText(h.invested),
  };
}

/**
 * Validates the form. Enter the amount invested or the average price (or both): a missing
 * one is derived from the other and the quantity. Currency follows the market.
 */
export function validateStockForm(form: StockForm): {
  errors: FormErrors<StockForm>;
  value: StockHoldingInput | null;
} {
  const symbol = form.symbol.trim().toUpperCase();
  const quantity = parseDecimal(form.quantity);
  const avg = parseDecimal(form.avgPrice);
  const invested = parseDecimal(form.invested);
  const errors = onlyErrors<StockForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    symbol: !symbol
      ? 'Enter the symbol.'
      : /^[A-Z0-9][A-Z0-9.&_-]{0,24}$/.test(symbol)
        ? undefined
        : 'Use the exchange symbol, e.g. RELIANCE or AAPL.',
    quantity: nonNegative(quantity, 'the quantity'),
    avgPrice: optionalNonNegative(avg),
    invested:
      optionalNonNegative(invested) ??
      (invested === null && avg === null
        ? 'Enter the amount invested or the average price.'
        : undefined),
  });
  if (Object.keys(errors).length) return { errors, value: null };

  const qty = quantity as number;
  const totalInvested = invested ?? (avg as number) * qty;
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      market: form.market,
      currency: form.market === 'US' ? 'USD' : 'INR',
      symbol,
      name: form.name.trim() || null,
      quantity: qty,
      invested: totalInvested,
      avg_price: avg ?? (qty > 0 ? totalInvested / qty : null),
    },
  };
}
