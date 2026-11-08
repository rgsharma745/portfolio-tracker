import { FdCompounding, FdInput, fdView } from '../../core/calc/fd';
import type { FixedDeposit, FixedDepositInput } from '../../core/data/fd.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

export const FD_BANK_MAX = 60;

export interface FdForm {
  portfolioId: string;
  bank: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`. */
  maturityDate: string;
  principal: string;
  /** Yearly rate in percent. */
  rate: string;
  compounding: FdCompounding;
}

export const COMPOUNDING_OPTIONS: { label: string; value: FdCompounding }[] = [
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Half-yearly', value: 'half_yearly' },
  { label: 'Yearly', value: 'yearly' },
  { label: 'Payout (interest paid out)', value: 'payout' },
];

const COMPOUNDING_LABELS: Record<string, string> = {
  quarterly: 'quarterly',
  monthly: 'monthly',
  half_yearly: 'half-yearly',
  yearly: 'yearly',
  payout: 'interest paid out',
};

/** "quarterly", "interest paid out", … for a card's details line. */
export function compoundingLabel(compounding: string): string {
  return COMPOUNDING_LABELS[compounding] ?? compounding;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A new FD starting today. */
export function emptyFdForm(portfolioId: string, today: string): FdForm {
  return {
    portfolioId,
    bank: '',
    startDate: today,
    maturityDate: '',
    principal: '',
    rate: '',
    compounding: 'quarterly',
  };
}

export function fdFormFrom(fd: FixedDeposit): FdForm {
  return {
    portfolioId: fd.portfolio_id,
    bank: fd.bank,
    startDate: fd.start_date,
    maturityDate: fd.maturity_date,
    principal: numberInputText(fd.principal),
    rate: numberInputText(fd.rate),
    compounding: (COMPOUNDING_LABELS[fd.compounding]
      ? fd.compounding
      : 'quarterly') as FdCompounding,
  };
}

function rateError(rate: number | null): string | undefined {
  if (rate === null) return 'Enter the interest rate.';
  if (Number.isNaN(rate)) return 'Enter a number, e.g. 7.25.';
  if (rate <= 0) return 'Must be more than zero.';
  if (rate >= 100) return 'Enter the yearly rate in percent, e.g. 7.25.';
  if (!/^\d+(\.\d{1,3})?$/.test(String(rate))) return 'Use at most 3 decimals.';
  return undefined;
}

export function validateFdForm(form: FdForm): {
  errors: FormErrors<FdForm>;
  value: (FixedDepositInput & FdInput) | null;
} {
  const bank = form.bank.trim();
  const principal = parseDecimal(form.principal);
  const rate = parseDecimal(form.rate);
  const startOk = ISO_DATE.test(form.startDate);
  const maturityOk = ISO_DATE.test(form.maturityDate);
  const errors = onlyErrors<FdForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    bank: !bank
      ? 'Enter the bank, e.g. SBI.'
      : bank.length > FD_BANK_MAX
        ? `Use at most ${FD_BANK_MAX} characters.`
        : undefined,
    startDate: startOk ? undefined : 'Pick the date of investment.',
    maturityDate: !maturityOk
      ? 'Pick the maturity date.'
      : startOk && form.maturityDate <= form.startDate
        ? 'Must be after the date of investment.'
        : undefined,
    principal:
      nonNegative(principal, 'the principal') ??
      (principal === 0 ? 'Must be more than zero.' : undefined),
    rate: rateError(rate),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      bank,
      start_date: form.startDate,
      maturity_date: form.maturityDate,
      principal: principal as number,
      rate: rate as number,
      compounding: form.compounding,
    },
  };
}

/** The maturity amount and interest for the dialog's preview, or null until the form is valid. */
export function fdPreview(
  form: FdForm,
  today: string,
): { maturityAmount: number; interest: number; days: number } | null {
  const { value } = validateFdForm({ ...form, portfolioId: form.portfolioId || '-' });
  if (!value) return null;
  const v = fdView(value, today);
  return { maturityAmount: v.maturityAmount, interest: v.maturityInterest, days: v.totalDays };
}

/** "45 days", "11 months", "1 year 3 months": a rough length for a number of days. */
export function durationText(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'}`;
  const months = Math.round(days / (365 / 12));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} ${years === 1 ? 'year' : 'years'}` : '';
  const m = rest ? `${rest} ${rest === 1 ? 'month' : 'months'}` : '';
  return [y, m].filter(Boolean).join(' ');
}
