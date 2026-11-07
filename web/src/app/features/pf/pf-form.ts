import { PfContributionType, WAGE_MONTHS, nextMonthDraft, wagePeriod } from '../../core/calc/pf';
import type { PfEntry, PfEntryInput } from '../../core/data/pf.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import {
  FormErrors,
  nonNegative,
  onlyErrors,
  optionalNonNegative,
} from '../../shared/format/validation';

export const COMPANY_NAME_MAX = 100;
/** EPF started long before this; earlier wage years are not offered. */
export const FIRST_YEAR = 1995;

export interface PfForm {
  portfolioId: string;
  company: string;
  type: PfContributionType;
  /** Monthly rows only: wage month 1 to 12 and its year. */
  month: number | null;
  year: number | null;
  /** When the amount was credited, `YYYY-MM-DD`. */
  transactionDate: string;
  employee: string;
  employer: string;
  pension: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function amounts(employee: number | null, employer: number | null, pension: number | null) {
  return {
    employee: numberInputText(employee),
    employer: numberInputText(employer),
    pension: numberInputText(pension),
  };
}

/** A new company: last month's wages credited today, nothing filled in. */
export function emptyPfForm(portfolioId: string, company: string, today: string): PfForm {
  const draft = nextMonthDraft([], company, portfolioId, today);
  return {
    portfolioId,
    company,
    type: 'monthly',
    month: draft.wage.month,
    year: draft.wage.year,
    transactionDate: draft.transactionDate,
    ...amounts(null, null, null),
  };
}

/** The wage month after the company's last contribution, with the same amounts. */
export function nextMonthForm(
  entries: readonly PfEntry[],
  company: string,
  portfolioId: string,
  today: string,
): PfForm {
  const draft = nextMonthDraft(entries, company, portfolioId, today);
  return {
    portfolioId,
    company,
    type: 'monthly',
    month: draft.wage.month,
    year: draft.wage.year,
    transactionDate: draft.transactionDate,
    ...amounts(draft.employee, draft.employer, draft.pension),
  };
}

/** Interest credited today, amounts empty (it has no wage month). */
export function interestForm(portfolioId: string, company: string, today: string): PfForm {
  return {
    portfolioId,
    company,
    type: 'interest',
    month: null,
    year: null,
    transactionDate: today,
    ...amounts(null, null, null),
  };
}

/**
 * The form after switching between Monthly and Interest. Amounts never carry over: a month's
 * contribution is not the year's interest. Interest starts empty and credited today; Monthly
 * refills the company's next wage month when it has one, otherwise starts empty.
 */
export function switchType(
  form: PfForm,
  type: PfContributionType,
  entries: readonly PfEntry[],
  today: string,
): PfForm {
  if (type === form.type) return form;
  if (type === 'interest') return interestForm(form.portfolioId, form.company, today);
  return nextMonthForm(entries, form.company, form.portfolioId, today);
}

export function pfFormFrom(e: PfEntry): PfForm {
  const wage = wagePeriod(e);
  return {
    portfolioId: e.portfolio_id,
    company: e.company,
    type: e.contribution_type === 'interest' ? 'interest' : 'monthly',
    month: wage?.month ?? null,
    year: wage?.year ?? null,
    transactionDate: e.transaction_date,
    ...amounts(
      e.employee_amount,
      e.employer_amount,
      e.contribution_type === 'interest' ? null : e.pension_amount,
    ),
  };
}

export function validatePfForm(form: PfForm): {
  errors: FormErrors<PfForm>;
  value: PfEntryInput | null;
} {
  const company = form.company.trim();
  const interest = form.type === 'interest';
  const employee = parseDecimal(form.employee);
  const employer = parseDecimal(form.employer);
  const pension = interest ? 0 : parseDecimal(form.pension);
  const errors = onlyErrors<PfForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    company: !company
      ? 'Enter the company name.'
      : company.length > COMPANY_NAME_MAX
        ? `Use at most ${COMPANY_NAME_MAX} characters.`
        : undefined,
    month: !interest && !form.month ? 'Choose the wage month.' : undefined,
    year: !interest && !form.year ? 'Choose the wage year.' : undefined,
    transactionDate: ISO_DATE.test(form.transactionDate)
      ? undefined
      : 'Pick the date it was credited.',
    employee: nonNegative(employee, 'the employee amount'),
    employer: nonNegative(employer, 'the employer amount'),
    pension: interest ? undefined : optionalNonNegative(pension),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      company,
      contribution_type: form.type,
      wage_month: interest ? null : WAGE_MONTHS[(form.month as number) - 1],
      wage_year: interest ? null : form.year,
      transaction_date: form.transactionDate,
      employee_amount: employee as number,
      employer_amount: employer as number,
      pension_amount: pension ?? 0,
    },
  };
}
