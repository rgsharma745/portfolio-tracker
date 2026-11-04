import type { SavingsAccount, SavingsAccountInput } from '../../core/data/holdings.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, onlyErrors } from '../../shared/format/validation';

export const BANK_NAME_MAX = 60;

export interface SavingsForm {
  portfolioId: string;
  bank: string;
  balance: string;
}

export function emptySavingsForm(portfolioId: string): SavingsForm {
  return { portfolioId, bank: '', balance: '' };
}

export function savingsFormFrom(a: SavingsAccount): SavingsForm {
  return { portfolioId: a.portfolio_id, bank: a.bank, balance: numberInputText(a.balance) };
}

/** A balance may be negative (an overdrawn account). */
export function balanceError(balance: number | null): string | undefined {
  if (balance === null) return 'Enter the balance.';
  if (Number.isNaN(balance)) return 'Enter a number, e.g. 125000.50.';
  return undefined;
}

export function validateSavingsForm(form: SavingsForm): {
  errors: FormErrors<SavingsForm>;
  value: SavingsAccountInput | null;
} {
  const bank = form.bank.trim();
  const balance = parseDecimal(form.balance);
  const errors = onlyErrors<SavingsForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    bank: !bank
      ? 'Enter the bank or account name.'
      : bank.length > BANK_NAME_MAX
        ? `Use at most ${BANK_NAME_MAX} characters.`
        : undefined,
    balance: balanceError(balance),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: { portfolio_id: form.portfolioId, bank, balance: balance as number },
  };
}
