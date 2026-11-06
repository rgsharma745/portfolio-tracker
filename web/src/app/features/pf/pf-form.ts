import {
  PfContributionType,
  fyStart,
  interestMonth,
  monthOf,
  nextMonthDraft,
} from '../../core/calc/pf';
import type { PfEntry, PfEntryInput } from '../../core/data/pf.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import {
  FormErrors,
  nonNegative,
  onlyErrors,
  optionalNonNegative,
} from '../../shared/format/validation';

export const COMPANY_NAME_MAX = 100;
/** EPF started long before this; earlier years are not offered. */
export const FIRST_YEAR = 1995;

export interface PfForm {
  portfolioId: string;
  company: string;
  type: PfContributionType;
  /** Monthly rows: 1 to 12. */
  month: number | null;
  year: number | null;
  /** Interest rows: the year the financial year starts in (April). */
  fy: number | null;
  employee: string;
  employer: string;
  pension: string;
}

function split(wageMonth: string): { month: number; year: number } {
  const [year, month] = wageMonth.split('-').map(Number);
  return { month, year };
}

/** A monthly form for `wageMonth`, with optional amounts already filled in. */
function monthlyForm(
  portfolioId: string,
  company: string,
  wageMonth: string,
  amounts: { employee: number | null; employer: number | null; pension: number | null },
): PfForm {
  const { month, year } = split(wageMonth);
  return {
    portfolioId,
    company,
    type: 'monthly',
    month,
    year,
    fy: fyStart(wageMonth),
    employee: numberInputText(amounts.employee),
    employer: numberInputText(amounts.employer),
    pension: numberInputText(amounts.pension),
  };
}

/** A new company: the current month, nothing filled in. */
export function emptyPfForm(portfolioId: string, today: string): PfForm {
  return monthlyForm(portfolioId, '', monthOf(today), {
    employee: null,
    employer: null,
    pension: null,
  });
}

/** The month after the company's last contribution, with the same amounts. */
export function nextMonthForm(
  entries: readonly PfEntry[],
  company: string,
  portfolioId: string,
  today: string,
): PfForm {
  const draft = nextMonthDraft(entries, company, portfolioId, today);
  return monthlyForm(portfolioId, company, draft.wageMonth, draft);
}

/** Interest for the financial year that ended most recently (the last March). */
export function interestForm(portfolioId: string, company: string, today: string): PfForm {
  const fy = fyStart(monthOf(today)) - 1;
  return {
    ...monthlyForm(portfolioId, company, interestMonth(fy), {
      employee: null,
      employer: null,
      pension: null,
    }),
    type: 'interest',
    fy,
  };
}

export function pfFormFrom(e: PfEntry): PfForm {
  const form = monthlyForm(e.portfolio_id, e.company, e.wage_month, {
    employee: e.employee_amount,
    employer: e.employer_amount,
    pension: e.pension_amount,
  });
  return e.contribution_type === 'interest' ? { ...form, type: 'interest' } : form;
}

export function validatePfForm(form: PfForm): {
  errors: FormErrors<PfForm>;
  value: PfEntryInput | null;
} {
  const company = form.company.trim();
  const employee = parseDecimal(form.employee);
  const employer = parseDecimal(form.employer);
  const pension = form.type === 'interest' ? 0 : parseDecimal(form.pension);
  const interest = form.type === 'interest';
  const errors = onlyErrors<PfForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    company: !company
      ? 'Enter the company name.'
      : company.length > COMPANY_NAME_MAX
        ? `Use at most ${COMPANY_NAME_MAX} characters.`
        : undefined,
    month: !interest && !form.month ? 'Choose the wage month.' : undefined,
    year: !interest && !form.year ? 'Choose the year.' : undefined,
    fy: interest && !form.fy ? 'Choose the financial year.' : undefined,
    employee: nonNegative(employee, 'the employee amount'),
    employer: nonNegative(employer, 'the employer amount'),
    pension: interest ? undefined : optionalNonNegative(pension),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  const wageMonth = interest
    ? interestMonth(form.fy as number)
    : `${form.year}-${String(form.month).padStart(2, '0')}-01`;
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      company,
      wage_month: wageMonth,
      contribution_type: form.type,
      employee_amount: employee as number,
      employer_amount: employer as number,
      pension_amount: pension ?? 0,
    },
  };
}
