import { PpfEntryType } from '../../core/calc/ppf';
import type { PpfEntry, PpfEntryInput } from '../../core/data/ppf.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

export const ACCOUNT_NAME_MAX = 100;

export interface PpfForm {
  portfolioId: string;
  account: string;
  type: PpfEntryType;
  /** `YYYY-MM-DD`. */
  date: string;
  amount: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A new row dated today. */
export function emptyPpfForm(
  portfolioId: string,
  account: string,
  today: string,
  type: PpfEntryType = 'investment',
): PpfForm {
  return { portfolioId, account, type, date: today, amount: '' };
}

export function ppfFormFrom(e: PpfEntry): PpfForm {
  return {
    portfolioId: e.portfolio_id,
    account: e.account,
    type: e.entry_type === 'interest' ? 'interest' : 'investment',
    date: e.entry_date,
    amount: numberInputText(e.amount),
  };
}

export function validatePpfForm(form: PpfForm): {
  errors: FormErrors<PpfForm>;
  value: PpfEntryInput | null;
} {
  const account = form.account.trim();
  const amount = parseDecimal(form.amount);
  const errors = onlyErrors<PpfForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    account: !account
      ? 'Enter the account name, e.g. SBI PPF.'
      : account.length > ACCOUNT_NAME_MAX
        ? `Use at most ${ACCOUNT_NAME_MAX} characters.`
        : undefined,
    date: ISO_DATE.test(form.date) ? undefined : 'Pick the date.',
    amount:
      nonNegative(amount, 'the amount') ?? (amount === 0 ? 'Must be more than zero.' : undefined),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      account,
      entry_type: form.type,
      entry_date: form.date,
      amount: amount as number,
    },
  };
}
