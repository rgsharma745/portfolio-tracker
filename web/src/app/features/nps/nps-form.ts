import { NPS_SCHEME_LABEL, NpsContributor, NpsSchemeClass } from '../../core/calc/nps';
import type {
  NpsContribution,
  NpsContributionInput,
  NpsHolding,
  NpsHoldingInput,
  NpsUnitsUpdate,
} from '../../core/data/nps.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

export const ACCOUNT_NAME_MAX = 100;
export const SCHEME_NAME_MAX = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** NPS scheme codes look like SM008001 (SM, PFM number, scheme number). */
const SCHEME_CODE = /^SM\d{6}$/;

function accountError(account: string): string | undefined {
  if (!account) return 'Enter the account name, e.g. Rahul PRAN.';
  return account.length > ACCOUNT_NAME_MAX
    ? `Use at most ${ACCOUNT_NAME_MAX} characters.`
    : undefined;
}

// ---- Contribution ----

export interface ContributionForm {
  portfolioId: string;
  account: string;
  contributor: NpsContributor;
  /** `YYYY-MM-DD`. */
  date: string;
  amount: string;
}

export function emptyContributionForm(
  portfolioId: string,
  account: string,
  today: string,
  contributor: NpsContributor = 'self',
): ContributionForm {
  return { portfolioId, account, contributor, date: today, amount: '' };
}

export function contributionFormFrom(c: NpsContribution): ContributionForm {
  return {
    portfolioId: c.portfolio_id,
    account: c.account,
    contributor: c.contributor === 'employer' ? 'employer' : 'self',
    date: c.contribution_date,
    amount: numberInputText(c.amount),
  };
}

export function validateContributionForm(form: ContributionForm): {
  errors: FormErrors<ContributionForm>;
  value: NpsContributionInput | null;
} {
  const account = form.account.trim();
  const amount = parseDecimal(form.amount);
  const errors = onlyErrors<ContributionForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    account: accountError(account),
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
      contributor: form.contributor,
      contribution_date: form.date,
      amount: amount as number,
    },
  };
}

// ---- Scheme (one holding row) ----

export interface SchemeForm {
  portfolioId: string;
  account: string;
  schemeClass: NpsSchemeClass;
  schemeCode: string;
  schemeName: string;
  units: string;
  /** `YYYY-MM-DD`, or '' when unknown. */
  asOf: string;
}

export function emptySchemeForm(
  portfolioId: string,
  account: string,
  schemeClass: NpsSchemeClass,
  today: string,
): SchemeForm {
  return {
    portfolioId,
    account,
    schemeClass,
    schemeCode: '',
    schemeName: '',
    units: '',
    asOf: today,
  };
}

export function schemeFormFrom(h: NpsHolding): SchemeForm {
  return {
    portfolioId: h.portfolio_id,
    account: h.account,
    schemeClass: (['E', 'C', 'G', 'A'] as const).find((c) => c === h.scheme_class) ?? 'E',
    schemeCode: h.scheme_code ?? '',
    schemeName: h.scheme_name,
    units: numberInputText(h.units),
    asOf: h.units_as_of ?? '',
  };
}

export function validateSchemeForm(form: SchemeForm): {
  errors: FormErrors<SchemeForm>;
  value: NpsHoldingInput | null;
} {
  const account = form.account.trim();
  const code = form.schemeCode.trim().toUpperCase();
  const name = form.schemeName.trim();
  const units = parseDecimal(form.units);
  const errors = onlyErrors<SchemeForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    account: accountError(account),
    schemeCode: code && !SCHEME_CODE.test(code) ? 'Scheme codes look like SM008001.' : undefined,
    schemeName: !name
      ? `Enter the scheme name, e.g. HDFC Scheme ${form.schemeClass} Tier I.`
      : name.length > SCHEME_NAME_MAX
        ? `Use at most ${SCHEME_NAME_MAX} characters.`
        : undefined,
    units: nonNegative(units, 'the units'),
    asOf: !form.asOf || ISO_DATE.test(form.asOf) ? undefined : 'Pick the date.',
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      account,
      scheme_class: form.schemeClass,
      scheme_code: code || null,
      scheme_name: name,
      units: units as number,
      units_as_of: form.asOf || null,
    },
  };
}

/** "Scheme E · Equity" */
export function schemeClassLabel(c: NpsSchemeClass): string {
  return `Scheme ${c} · ${NPS_SCHEME_LABEL[c]}`;
}

// ---- Update units (every scheme of one account) ----

export interface UnitsForm {
  account: string;
  /** `YYYY-MM-DD`. */
  asOf: string;
  /** One entry per scheme row of the account. */
  lines: { id: string; schemeClass: string; schemeName: string; units: string }[];
}

export function unitsFormFrom(holdings: readonly NpsHolding[], today: string): UnitsForm {
  return {
    account: holdings[0]?.account ?? '',
    asOf: today,
    lines: holdings.map((h) => ({
      id: h.id,
      schemeClass: h.scheme_class,
      schemeName: h.scheme_name,
      units: numberInputText(h.units),
    })),
  };
}

export type UnitsErrors = FormErrors<UnitsForm> & { lineErrors?: Record<string, string> };

export function validateUnitsForm(form: UnitsForm): {
  errors: UnitsErrors;
  value: { updates: NpsUnitsUpdate[]; asOf: string } | null;
} {
  const lineErrors: Record<string, string> = {};
  const updates: NpsUnitsUpdate[] = [];
  for (const line of form.lines) {
    const units = parseDecimal(line.units);
    const error = nonNegative(units, 'the units');
    if (error) lineErrors[line.id] = error;
    else updates.push({ id: line.id, units: units as number });
  }
  const errors: UnitsErrors = onlyErrors<UnitsForm>({
    asOf: ISO_DATE.test(form.asOf) ? undefined : 'Pick the statement date.',
  });
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors;
  if (Object.keys(errors).length) return { errors, value: null };
  return { errors: {}, value: { updates, asOf: form.asOf } };
}
