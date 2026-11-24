import { equityTotals, equityValue, grantStatus, trancheRemaining } from './equity';
import type { EquityEvent, EquityGrant, EquityLot, EquitySaleDetail } from '../data/equity.service';

const grant: EquityGrant = {
  id: 'grant',
  owner_id: 'owner',
  portfolio_id: 'me',
  security_id: 'security',
  kind: 'ESOP',
  label: 'Options',
  granted_on: '2025-01-01',
  quantity: 20,
  grant_price: 10,
  expires_on: '2028-01-01',
};
const vest: EquityEvent = {
  id: 'vest',
  owner_id: 'owner',
  portfolio_id: 'me',
  grant_id: 'grant',
  kind: 'vest',
  schedule_id: 'tranche',
  occurred_on: '2025-06-01',
  allotted_on: null,
  currency: null,
  fmv: null,
  fx: null,
  purchase_price: null,
  fees: 0,
  tax_units: 0,
  tax_paid_inr: null,
  quantity: 8,
};
const exercise: EquityEvent = {
  ...vest,
  id: 'exercise',
  kind: 'exercise',
  quantity: 5,
  allotted_on: '2025-06-02',
  tax_units: 1,
  tax_paid_inr: 500,
  fmv: 20,
  currency: 'USD',
  fx: 80,
  purchase_price: 10,
};
const lot: EquityLot = {
  ...exercise,
  security_id: 'security',
  grant_kind: 'ESOP',
  held_units: 2,
  sold_units: 2,
  gross_fmv: 100,
  perquisite: 50,
  acquisition_expenses_inr: 4500,
  purchase_cost_inr: 4000,
  basis_per_share_inr: 1600,
  held_basis_inr: 3200,
  value_inr: 4000,
  unrealized_inr: 800,
  unrealized_return: 25,
  current_fx: 80,
  current_price: 25,
  price_date: '2026-05-01',
};
const allocation: EquitySaleDetail = {
  id: 'alloc',
  sale_id: 'sale',
  owner_id: 'owner',
  event_id: 'exercise',
  grant_id: 'grant',
  security_id: 'security',
  portfolio_id: 'me',
  sold_on: '2026-05-01',
  quantity: 2,
  allotted_on: '2025-06-02',
  holding_days: 333,
  classification: 'Short-term',
  currency: 'USD',
  fx: 82,
  effective_fx: 80,
  bank_inr: 1600,
  sale_bank_inr: 1600,
  bank_on: '2026-05-05',
  gross: 50,
  net: 50,
  basis_inr: 3200,
  realized_inr: 800,
  return_percent: 25,
  sale_net: 50,
  sale_payout: 20,
  payout: 20,
  deductions: 30,
  total_quantity: 2,
  exercise_deduction: 25,
  tax_deduction: 5,
};

describe('employee equity display totals', () => {
  it('sums quantities, preserves exercise cash cost, and counts reported tax once', () => {
    const total = equityTotals([grant], [vest, exercise], [lot], [allocation]);
    expect(total).toMatchObject({
      granted: 20,
      pending: 12,
      vested: 8,
      exercised: 5,
      taxUnits: 1,
      sold: 2,
      held: 2,
      taxes: 500,
      purchase: 4000,
      value: 4000,
      realized: 800,
      unrealized: 800,
      received: 1600,
    });
    const unreported = { ...exercise, tax_paid_inr: null };
    expect(equityTotals([grant], [vest, unreported], [lot], [allocation]).taxes).toBe(400);
    expect(
      equityTotals([grant], [vest, unreported], [lot], [{ ...allocation, effective_fx: null }])
        .taxes,
    ).toBe(410);
  });

  it('values only in-scope acquired shares and reports missing quotes separately', () => {
    const lots = [
      lot,
      { ...lot, value_inr: null },
      { ...lot, portfolio_id: 'other' },
      { ...lot, held_units: 0 },
    ];
    expect(equityValue(lots, ['me'])).toEqual({
      count: 1,
      unpriced: 1,
      priced: 1,
      value: 4000,
      basis: 3200,
    });
    expect(equityTotals([grant], [], lots, []).unpriced).toBe(1);
    expect(equityValue(lots, [])).toEqual({ count: 0, unpriced: 0, priced: 0, value: 0, basis: 0 });
  });

  it('tracks partial tranches and distinguishes expiry from a closed grant', () => {
    expect(
      trancheRemaining(
        {
          id: 'tranche',
          portfolio_id: 'me',
          grant_id: 'grant',
          owner_id: 'owner',
          scheduled_on: '2025-06-01',
          quantity: 10,
        },
        [vest],
      ),
    ).toBe(2);
    expect(
      grantStatus(
        grant,
        { pending: 12, vested: 8, held: 2, exercised: 5, pendingAllotment: 0 },
        '2025-06-01',
      ),
    ).toBe('Partially vested');
    expect(
      grantStatus(
        grant,
        { pending: 12, vested: 8, held: 2, exercised: 5, pendingAllotment: 0 },
        '2028-06-01',
      ),
    ).toBe('Expired');
    expect(
      grantStatus(
        grant,
        { pending: 0, vested: 20, held: 0, exercised: 20, pendingAllotment: 0 },
        '2025-06-01',
      ),
    ).toBe('Closed');
    expect(
      grantStatus(
        grant,
        { pending: 0, vested: 20, held: 0, exercised: 0, pendingAllotment: 0 },
        '2025-06-01',
      ),
    ).toBe('Fully vested');
    expect(
      grantStatus(
        grant,
        { pending: 20, vested: 0, held: 0, exercised: 0, pendingAllotment: 0 },
        '2025-06-01',
      ),
    ).toBe('Unvested');
  });
});
