import type {
  EquityEvent,
  EquityGrant,
  EquityLot,
  EquitySaleDetail,
  EquitySchedule,
} from '../data/equity.service';

export function equityValue(
  lots: readonly Pick<
    EquityLot,
    'portfolio_id' | 'grant_id' | 'held_units' | 'value_inr' | 'held_basis_inr'
  >[],
  portfolioIds: readonly string[],
) {
  const ids = new Set(portfolioIds);
  const held = lots.filter((lot) => ids.has(lot.portfolio_id) && (lot.held_units ?? 0) > 0);
  const priced = held.filter((lot) => lot.value_inr !== null);
  return {
    count: new Set(held.map((lot) => lot.grant_id)).size,
    unpriced: held.length - priced.length,
    priced: priced.length,
    value: priced.reduce((sum, lot) => sum + (lot.value_inr ?? 0), 0),
    basis: priced.reduce((sum, lot) => sum + (lot.held_basis_inr ?? 0), 0),
  };
}

export function brokerTaxInr(sale: EquitySaleDetail): number {
  return sale.tax_deduction * (sale.effective_fx ?? sale.fx ?? 0);
}

export function equityTotals(
  grants: readonly EquityGrant[],
  events: readonly EquityEvent[],
  lots: readonly EquityLot[],
  details: readonly EquitySaleDetail[],
) {
  const granted = grants.reduce((sum, g) => sum + g.quantity, 0);
  const vested = events.reduce((sum, e) => sum + (e.kind === 'vest' ? e.quantity : 0), 0);
  const priced = lots.filter((lot) => (lot.held_units ?? 0) > 0 && lot.value_inr !== null);
  const reportedTax = events.reduce((sum, event) => sum + (event.tax_paid_inr ?? 0), 0);
  const reportedEvents = new Set(
    events.filter((event) => event.tax_paid_inr !== null).map((event) => event.id),
  );
  const brokerTax = details.reduce(
    (sum, sale) => (reportedEvents.has(sale.event_id) ? sum : sum + brokerTaxInr(sale)),
    0,
  );
  return {
    granted,
    vested,
    pending: granted - vested,
    taxUnits: events.reduce((sum, event) => sum + event.tax_units, 0),
    exercised: events.reduce((sum, e) => sum + (e.kind === 'exercise' ? e.quantity : 0), 0),
    pendingAllotment: events.reduce(
      (sum, event) => sum + (event.kind === 'exercise' && !event.allotted_on ? event.quantity : 0),
      0,
    ),
    sold: details.reduce((sum, sale) => sum + sale.quantity, 0),
    held: lots.reduce((sum, lot) => sum + (lot.held_units ?? 0), 0),
    purchase: lots.reduce((sum, lot) => sum + (lot.purchase_cost_inr ?? 0), 0),
    taxes: reportedTax + brokerTax,
    value: priced.reduce((sum, lot) => sum + (lot.value_inr ?? 0), 0),
    unrealized: priced.reduce((sum, lot) => sum + (lot.unrealized_inr ?? 0), 0),
    realized: details.reduce((sum, sale) => sum + (sale.realized_inr ?? 0), 0),
    received: details.reduce((sum, sale) => sum + (sale.bank_inr ?? 0), 0),
    priced: priced.length,
    unpriced: lots.filter((lot) => (lot.held_units ?? 0) > 0 && lot.value_inr === null).length,
  };
}

export function trancheRemaining(tranche: EquitySchedule, events: readonly EquityEvent[]): number {
  return Math.max(
    0,
    tranche.quantity -
      events
        .filter((event) => event.schedule_id === tranche.id)
        .reduce((sum, event) => sum + event.quantity, 0),
  );
}

export function grantStatus(
  grant: EquityGrant,
  quantities: {
    pending: number;
    vested: number;
    held: number;
    exercised: number;
    pendingAllotment: number;
  },
  today: string,
): string {
  if (quantities.pendingAllotment > 0) return 'Awaiting allotment';
  if (quantities.pending <= 0 && quantities.held <= 0) {
    if (grant.kind === 'RSU' || quantities.exercised >= quantities.vested) return 'Closed';
  }
  if (grant.expires_on && grant.expires_on < today) return 'Expired';
  if (quantities.pending <= 0) return 'Fully vested';
  return quantities.vested > 0 ? 'Partially vested' : 'Unvested';
}
