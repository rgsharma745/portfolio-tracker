import { MISSING } from './money';

/** Units and quantities: en-IN grouping, up to 4 decimals, no trailing zeros. */
export function formatUnits(value: number | null | undefined, maxDigits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDigits }).format(value);
}

/** A calendar date (`YYYY-MM-DD`) as "3 Nov 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** A month (`YYYY-MM-01`) as "November 2026". */
export function formatMonth(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Parses a number typed by the owner: allows grouping commas, spaces and a leading ₹ or $.
 * Returns null for empty input and NaN for anything that is not a number.
 */
export function parseDecimal(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return text;
  const cleaned = (text ?? '').replace(/[\s,₹$]/g, '');
  if (!cleaned) return null;
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(cleaned) ? Number(cleaned) : NaN;
}

/** Text for a number input, without grouping so it parses back unchanged. */
export function numberInputText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
