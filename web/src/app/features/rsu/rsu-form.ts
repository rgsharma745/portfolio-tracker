import type { RsuGrant, RsuGrantInput } from '../../core/data/holdings.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

export interface RsuForm {
  portfolioId: string;
  symbol: string;
  label: string;
  grantDate: string;
  granted: string;
  vested: string;
  soldForTax: string;
  /** Percent, 0 to 100 (stored as a fraction). */
  taxPercent: string;
}

export function emptyRsuForm(portfolioId: string, symbol = ''): RsuForm {
  return {
    portfolioId,
    symbol,
    label: '',
    grantDate: '',
    granted: '',
    vested: '0',
    soldForTax: '0',
    taxPercent: '',
  };
}

export function rsuFormFrom(g: RsuGrant): RsuForm {
  return {
    portfolioId: g.portfolio_id,
    symbol: g.symbol,
    label: g.grant_label,
    grantDate: g.grant_date ?? '',
    granted: numberInputText(g.units_granted),
    vested: numberInputText(g.units_vested),
    soldForTax: numberInputText(g.units_sold_for_tax),
    taxPercent: numberInputText(round(g.tax_rate * 100)),
  };
}

export function validateRsuForm(form: RsuForm): {
  errors: FormErrors<RsuForm>;
  value: RsuGrantInput | null;
} {
  const symbol = form.symbol.trim().toUpperCase();
  const label = form.label.trim();
  const granted = parseDecimal(form.granted);
  const vested = parseDecimal(form.vested);
  const sold = parseDecimal(form.soldForTax);
  const tax = parseDecimal(form.taxPercent);
  const numbersOk = (...values: (number | null)[]) =>
    values.every((v) => v !== null && !Number.isNaN(v) && v >= 0);

  const errors = onlyErrors<RsuForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    symbol: !symbol
      ? 'Enter the stock symbol, e.g. AAPL.'
      : /^[A-Z0-9][A-Z0-9.&_-]{0,24}$/.test(symbol)
        ? undefined
        : 'Use the exchange symbol, e.g. AAPL.',
    label: label ? undefined : 'Name the grant, e.g. "2024 annual".',
    grantDate:
      !form.grantDate || /^\d{4}-\d{2}-\d{2}$/.test(form.grantDate) ? undefined : 'Pick a date.',
    granted: nonNegative(granted, 'the units granted'),
    vested:
      nonNegative(vested, 'the units vested') ??
      (numbersOk(granted, vested) && (vested as number) > (granted as number)
        ? 'Cannot be more than the units granted.'
        : undefined),
    soldForTax:
      nonNegative(sold, 'the units sold for tax') ??
      (numbersOk(vested, sold) && (sold as number) > (vested as number)
        ? 'Cannot be more than the units vested.'
        : undefined),
    taxPercent:
      nonNegative(tax, 'the tax rate') ?? ((tax as number) > 100 ? 'Use 0 to 100%.' : undefined),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      symbol,
      grant_label: label,
      grant_date: form.grantDate || null,
      units_granted: granted as number,
      units_vested: vested as number,
      units_sold_for_tax: sold as number,
      tax_rate: round((tax as number) / 100, 4),
    },
  };
}

/** Avoids float noise such as 30.000000000000004 when converting the rate. */
function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
