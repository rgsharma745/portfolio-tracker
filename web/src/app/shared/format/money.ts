import { MASK, amountsHidden } from './privacy';

export type Currency = 'INR' | 'USD';

export interface MoneyFormatOptions {
  /** Fraction digits. Default: 0 for INR, 2 for USD. */
  digits?: number;
  /** Always show a sign: `+` for gains, `-` for losses, none for zero. */
  sign?: boolean;
  /** Short form for large INR values: ₹56.74L, ₹1.25Cr. */
  compact?: boolean;
}

const LOCALE: Record<Currency, string> = { INR: 'en-IN', USD: 'en-US' };
const LAKH = 1e5;
const CRORE = 1e7;
export const MISSING = '—';

/**
 * Formats money for display. Rounding happens here only, never in stored values.
 * In privacy mode every amount prints as ••••, sign included.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: Currency = 'INR',
  options: MoneyFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  if (amountsHidden()) return MASK;

  const abs = Math.abs(value);
  if (options.compact && currency === 'INR' && abs >= LAKH) {
    const [unit, divisor] = abs >= CRORE ? ['Cr', CRORE] : ['L', LAKH];
    const scaled = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
      abs / divisor,
    );
    return `${signPrefix(value, options.sign)}₹${scaled}${unit}`;
  }

  const digits = options.digits ?? (currency === 'INR' ? 0 : 2);
  return new Intl.NumberFormat(LOCALE[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: options.sign ? 'exceptZero' : 'auto',
  }).format(value);
}

/** Percentage with an explicit sign, e.g. +12.34%. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  return (
    new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: 'exceptZero',
    }).format(value) + '%'
  );
}

function signPrefix(value: number, sign: boolean | undefined): string {
  if (value < 0) return '-';
  return sign && value > 0 ? '+' : '';
}
