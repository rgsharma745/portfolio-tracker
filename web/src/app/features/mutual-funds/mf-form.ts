import type { MfHolding, MfHoldingInput } from '../../core/data/holdings.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { FormErrors, nonNegative, onlyErrors } from '../../shared/format/validation';

/** The add/edit fund form as typed text. */
export interface MfForm {
  portfolioId: string;
  schemeName: string;
  schemeCode: string;
  folio: string;
  units: string;
  invested: string;
}

export function emptyMfForm(portfolioId: string): MfForm {
  return { portfolioId, schemeName: '', schemeCode: '', folio: '', units: '', invested: '' };
}

export function mfFormFrom(h: MfHolding): MfForm {
  return {
    portfolioId: h.portfolio_id,
    schemeName: h.scheme_name,
    schemeCode: h.scheme_code ?? '',
    folio: h.folio ?? '',
    units: numberInputText(h.units),
    invested: numberInputText(h.invested),
  };
}

/** Validates the form; `value` is set only when there are no errors. */
export function validateMfForm(form: MfForm): {
  errors: FormErrors<MfForm>;
  value: MfHoldingInput | null;
} {
  const name = form.schemeName.trim();
  const code = form.schemeCode.trim();
  const units = parseDecimal(form.units);
  const invested = parseDecimal(form.invested);
  const errors = onlyErrors<MfForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    schemeName: name ? undefined : 'Enter the fund name.',
    schemeCode: !code || /^\d{3,8}$/.test(code) ? undefined : 'AMFI scheme codes are numbers only.',
    units: nonNegative(units, 'units'),
    invested: nonNegative(invested, 'the amount invested'),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      scheme_name: name,
      scheme_code: code || null,
      folio: form.folio.replace(/\s+/g, '') || null,
      units: units as number,
      invested: invested as number,
    },
  };
}
