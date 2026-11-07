import type { JobName, JobRun } from '../../core/data/market.service';
import { parseDecimal } from '../../shared/format/number';
import { FormErrors, onlyErrors } from '../../shared/format/validation';

export const JOB_LABEL: Record<JobName, string> = {
  fetch_nav: 'Mutual fund NAVs',
  fetch_nps_nav: 'NPS NAVs',
  fetch_prices: 'Stock prices and USD/INR',
  snapshot: 'Daily snapshot',
  backup: 'Weekly backup',
};

/**
 * A line about a job run for Settings. Successful runs store a JSON summary, shown in words
 * ("42 updated, 2 not found in the AMFI file" or "the NPS NAV file"); failures store plain text, shown as it is.
 */
export function describeRun(run: Pick<JobRun, 'job' | 'status' | 'message'>): string {
  if (run.status !== 'success' || !run.message) return run.message ?? '';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(run.message) as Record<string, unknown>;
  } catch {
    return run.message;
  }
  const count = (key: string) =>
    Array.isArray(parsed[key]) ? (parsed[key] as unknown[]).length : 0;
  const parts: string[] = [];
  if (typeof parsed['updated'] === 'number') parts.push(`${parsed['updated']} updated`);
  if (count('unmatched')) {
    const file = run.job === 'fetch_nps_nav' ? 'NPS NAV file' : 'AMFI file';
    parts.push(`${count('unmatched')} not found in the ${file}`);
  }
  if (count('missing')) parts.push(`no price for ${(parsed['missing'] as string[]).join(', ')}`);
  if (typeof parsed['fx'] === 'string' && parsed['fx'] !== 'not needed') {
    parts.push(`USD/INR ${parsed['fx'] === 'manual' ? 'set by hand' : 'from ' + parsed['fx']}`);
  }
  if (typeof parsed['rows'] === 'number') {
    parts.push(`${parsed['rows']} ${parsed['rows'] === 1 ? 'portfolio' : 'portfolios'}`);
  }
  if (typeof parsed['file'] === 'string') parts.push(parsed['file']);
  return parts.length ? parts.join(', ') : run.message;
}

export type OverrideKind = 'stock' | 'usdinr';

export interface OverrideForm {
  kind: OverrideKind;
  symbol: string;
  price: string;
  date: string;
}

export function validateOverrideForm(
  form: OverrideForm,
  today: string,
): {
  errors: FormErrors<OverrideForm>;
  value: { kind: OverrideKind; symbol: string; price: number; date: string } | null;
} {
  const symbol = form.symbol.trim().toUpperCase();
  const price = parseDecimal(form.price);
  const errors = onlyErrors<OverrideForm>({
    symbol:
      form.kind === 'usdinr' || symbol
        ? form.kind === 'stock' && !/^[A-Z0-9][A-Z0-9.&_-]{0,24}$/.test(symbol)
          ? 'Use the exchange symbol, e.g. RELIANCE or AAPL.'
          : undefined
        : 'Choose or type a symbol.',
    price:
      price === null
        ? form.kind === 'usdinr'
          ? 'Enter the rate.'
          : 'Enter the price.'
        : Number.isNaN(price) || price <= 0
          ? 'Must be more than zero.'
          : undefined,
    date: !/^\d{4}-\d{2}-\d{2}$/.test(form.date)
      ? 'Pick a date.'
      : form.date > today
        ? 'Cannot be in the future.'
        : undefined,
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: { kind: form.kind, symbol, price: price as number, date: form.date },
  };
}
