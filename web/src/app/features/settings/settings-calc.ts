import type { JobName, JobRun } from '../../core/data/market.service';
import { parseDecimal } from '../../shared/format/number';
import { FormErrors, onlyErrors } from '../../shared/format/validation';

export const JOB_LABEL: Record<JobName, string> = {
  fetch_nav: 'Mutual fund NAVs',
  fetch_prices: 'Stock prices and USD/INR',
  snapshot: 'Daily snapshot',
  backup: 'Weekly backup',
};

/**
 * A line about a job run for Settings: the NAV job's JSON message becomes "42 updated,
 * 2 not found"; other messages show as they are.
 */
export function describeRun(run: Pick<JobRun, 'job' | 'status' | 'message'>): string {
  if (run.job === 'fetch_nav' && run.status === 'success' && run.message) {
    try {
      const parsed = JSON.parse(run.message) as { updated?: unknown; unmatched?: unknown };
      const parts: string[] = [];
      if (typeof parsed.updated === 'number') parts.push(`${parsed.updated} updated`);
      if (Array.isArray(parsed.unmatched) && parsed.unmatched.length) {
        parts.push(`${parsed.unmatched.length} not found in the AMFI file`);
      }
      if (parts.length) return parts.join(', ');
    } catch {
      // Not JSON: fall through to the raw message.
    }
  }
  return run.message ?? '';
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
