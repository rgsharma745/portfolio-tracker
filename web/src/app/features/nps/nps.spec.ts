import type { NpsContribution, NpsHolding } from '../../core/data/nps.service';
import {
  ContributionForm,
  SchemeForm,
  contributionFormFrom,
  emptyContributionForm,
  emptySchemeForm,
  schemeClassLabel,
  schemeFormFrom,
  unitsFormFrom,
  validateContributionForm,
  validateSchemeForm,
  validateUnitsForm,
} from './nps-form';
import { xirrText } from './nps-page';

const contribution = (overrides: Partial<ContributionForm> = {}): ContributionForm => ({
  portfolioId: 'p1',
  account: ' Rahul PRAN ',
  contributor: 'employer',
  date: '2026-04-05',
  amount: '8,123.45',
  ...overrides,
});

const scheme = (overrides: Partial<SchemeForm> = {}): SchemeForm => ({
  portfolioId: 'p1',
  account: 'Rahul PRAN',
  schemeClass: 'E',
  schemeCode: ' sm008001 ',
  schemeName: ' HDFC Scheme E Tier I ',
  units: '1,234.5678',
  asOf: '2026-10-31',
  ...overrides,
});

const holding = (overrides: Partial<NpsHolding> = {}): NpsHolding => ({
  id: 'h1',
  owner_id: 'o',
  portfolio_id: 'p1',
  account: 'Rahul PRAN',
  scheme_class: 'E',
  scheme_code: 'SM008001',
  scheme_name: 'HDFC Scheme E Tier I',
  units: 1234.5678,
  units_as_of: '2026-10-31',
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('NPS contribution form', () => {
  it('saves a trimmed account, the contributor, date and amount', () => {
    expect(validateContributionForm(contribution()).value).toEqual({
      portfolio_id: 'p1',
      account: 'Rahul PRAN',
      contributor: 'employer',
      contribution_date: '2026-04-05',
      amount: 8123.45,
    });
  });

  it('refuses a missing portfolio, account, date or amount, zero and long names', () => {
    const { errors, value } = validateContributionForm(
      contribution({ portfolioId: '', account: ' ', date: '', amount: '' }),
    );
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['account', 'amount', 'date', 'portfolioId']);
    expect(validateContributionForm(contribution({ amount: '0' })).errors.amount).toBe(
      'Must be more than zero.',
    );
    expect(
      validateContributionForm(contribution({ account: 'x'.repeat(101) })).errors.account,
    ).toContain('100');
  });

  it('starts a new row today and round-trips a contribution', () => {
    expect(emptyContributionForm('p1', 'Rahul PRAN', '2026-11-07')).toEqual({
      portfolioId: 'p1',
      account: 'Rahul PRAN',
      contributor: 'self',
      date: '2026-11-07',
      amount: '',
    });
    const row: NpsContribution = {
      id: 'c1',
      owner_id: 'o',
      portfolio_id: 'p1',
      account: 'Rahul PRAN',
      contribution_date: '2026-04-05',
      contributor: 'employer',
      amount: 8123.45,
      created_at: '',
      updated_at: '',
    };
    const form = contributionFormFrom(row);
    expect(form.contributor).toBe('employer');
    expect(validateContributionForm(form).value?.amount).toBe(8123.45);
    expect(contributionFormFrom({ ...row, contributor: 'other' }).contributor).toBe('self');
  });
});

describe('NPS scheme form', () => {
  it('upper-cases the code and trims the name', () => {
    expect(validateSchemeForm(scheme()).value).toEqual({
      portfolio_id: 'p1',
      account: 'Rahul PRAN',
      scheme_class: 'E',
      scheme_code: 'SM008001',
      scheme_name: 'HDFC Scheme E Tier I',
      units: 1234.5678,
      units_as_of: '2026-10-31',
    });
  });

  it('allows no code (no NAV yet) and no date', () => {
    const value = validateSchemeForm(scheme({ schemeCode: '', asOf: '' })).value;
    expect(value?.scheme_code).toBeNull();
    expect(value?.units_as_of).toBeNull();
  });

  it('refuses a bad code, a missing name and negative units', () => {
    const { errors, value } = validateSchemeForm(
      scheme({ schemeCode: 'HDFC', schemeName: ' ', units: '-1', account: '' }),
    );
    expect(value).toBeNull();
    expect(errors.schemeCode).toBe('Scheme codes look like SM008001.');
    expect(errors.schemeName).toContain('Scheme E');
    expect(errors.units).toBe('Must be zero or more.');
    expect(errors.account).toContain('PRAN');
    expect(validateSchemeForm(scheme({ schemeName: 'x'.repeat(201) })).errors.schemeName).toContain(
      '200',
    );
    expect(validateSchemeForm(scheme({ asOf: '31/10/2026' })).errors.asOf).toBe('Pick the date.');
  });

  it('starts empty for a class and round-trips a holding', () => {
    expect(emptySchemeForm('p1', 'Rahul PRAN', 'G', '2026-11-07')).toMatchObject({
      schemeClass: 'G',
      units: '',
      asOf: '2026-11-07',
    });
    expect(schemeFormFrom(holding())).toEqual({
      portfolioId: 'p1',
      account: 'Rahul PRAN',
      schemeClass: 'E',
      schemeCode: 'SM008001',
      schemeName: 'HDFC Scheme E Tier I',
      units: '1234.5678',
      asOf: '2026-10-31',
    });
    expect(
      schemeFormFrom(holding({ scheme_class: 'X', scheme_code: null, units_as_of: null })),
    ).toMatchObject({ schemeClass: 'E', schemeCode: '', asOf: '' });
    expect(schemeClassLabel('G')).toBe('Scheme G · Government securities');
  });
});

describe('NPS units form', () => {
  it('updates every scheme as of one date', () => {
    const form = unitsFormFrom(
      [holding(), holding({ id: 'h2', scheme_class: 'C', units: 10 })],
      '2026-11-07',
    );
    expect(form.account).toBe('Rahul PRAN');
    expect(form.lines.map((l) => l.units)).toEqual(['1234.5678', '10']);
    form.lines[1].units = '12.5';
    expect(validateUnitsForm(form).value).toEqual({
      updates: [
        { id: 'h1', units: 1234.5678 },
        { id: 'h2', units: 12.5 },
      ],
      asOf: '2026-11-07',
    });
  });

  it('flags a bad line and a missing date', () => {
    const form = unitsFormFrom([holding()], '');
    form.lines[0].units = 'abc';
    const { errors, value } = validateUnitsForm(form);
    expect(value).toBeNull();
    expect(errors.asOf).toBe('Pick the statement date.');
    expect(errors.lineErrors?.['h1']).toContain('Enter a number');
    expect(unitsFormFrom([], '2026-11-07').account).toBe('');
  });
});

describe('xirrText', () => {
  it('shows a signed yearly percentage, or a dash', () => {
    expect(xirrText(0.1234)).toBe('+12.34%');
    expect(xirrText(-0.05)).toBe('-5.00%');
    expect(xirrText(null)).toBe('—');
  });
});
