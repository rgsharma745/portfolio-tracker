import { isStale } from '../../core/calc/common';
import { brokerTaxInr, equityTotals, grantStatus, trancheRemaining } from '../../core/calc/equity';
import type {
  EquityEvent,
  EquityGrant,
  EquityLot,
  EquitySale,
  EquitySaleDetail,
  EquitySchedule,
  EquitySecurity,
} from '../../core/data/equity.service';
import { formatMoney } from '../../shared/format/money';
import { formatDate, formatUnits } from '../../shared/format/number';
import { EquityEntity } from './equity-form';

export interface EquityRow {
  id: string;
  name: string;
  subtitle: string;
  date: string | null;
  quantity: number | null;
  value: number | null;
  status: string;
  entity: EquityEntity;
  details: { label: string; value: string }[];
}

export function companyLabel(security: EquitySecurity | undefined): string {
  return security?.symbol ? `${security.name} · ${security.symbol}` : (security?.name ?? '');
}

function money(value: number | null, currency: string | null = 'INR'): string {
  return formatMoney(value, currency === 'USD' ? 'USD' : 'INR', { digits: 2 });
}

const units = (value: number | null) => formatUnits(value, 6);
const percent = (value: number | null) => (value === null ? '—' : `${formatUnits(value, 2)}%`);
const item = (label: string, value: string) => ({ label, value });

export function grantRow(
  grant: EquityGrant,
  company: string,
  portfolio: string,
  events: readonly EquityEvent[],
  lots: readonly EquityLot[],
  details: readonly EquitySaleDetail[],
  today: string,
): EquityRow {
  const total = equityTotals([grant], events, lots, details);
  return {
    id: grant.id,
    name: grant.label,
    subtitle: [company, portfolio, grant.kind].filter(Boolean).join(' · '),
    date: grant.granted_on,
    quantity: grant.quantity,
    value: total.unpriced && !total.priced ? null : total.value,
    status: grantStatus(grant, total, today),
    entity: grant,
    details: [
      item('Vested', units(total.vested)),
      item('Pending', units(total.pending)),
      item('Withheld or sold for tax', units(total.taxUnits)),
      item('Voluntarily sold', units(total.sold)),
      item('Shares held', units(total.held)),
      ...(grant.kind === 'ESOP'
        ? [
            item('Exercised', units(total.exercised)),
            item('Awaiting allotment', units(total.pendingAllotment)),
            item(
              'Available to exercise',
              units(
                grant.expires_on && grant.expires_on < today ? 0 : total.vested - total.exercised,
              ),
            ),
            item('Expiry', formatDate(grant.expires_on)),
          ]
        : []),
      item('Realized P&L', money(total.realized)),
      item('Unrealized P&L', total.unpriced && !total.priced ? '—' : money(total.unrealized)),
    ],
  };
}

export function scheduleRow(
  tranche: EquitySchedule,
  grantName: string,
  subtitle: string,
  events: readonly EquityEvent[],
  today: string,
): EquityRow {
  const remaining = trancheRemaining(tranche, events);
  const complete = remaining === 0;
  return {
    id: tranche.id,
    name: grantName,
    subtitle,
    date: tranche.scheduled_on,
    quantity: remaining,
    value: null,
    status: complete ? 'Completed' : tranche.scheduled_on < today ? 'Overdue' : 'Scheduled',
    entity: tranche,
    details: [
      item('Scheduled quantity', units(tranche.quantity)),
      item('Recorded', units(tranche.quantity - remaining)),
    ],
  };
}

export function eventRow(
  event: EquityEvent,
  grantName: string,
  subtitle: string,
  lot: EquityLot | undefined,
  sales: readonly EquitySaleDetail[],
  today: string,
  privateCompany: boolean,
): EquityRow {
  const soldBasis = sales.reduce((sum, sale) => sum + (sale.basis_inr ?? 0), 0);
  const realized = sales.reduce((sum, sale) => sum + (sale.realized_inr ?? 0), 0);
  const recordedTax =
    lot?.tax_paid_inr ??
    (sales.some((sale) => sale.tax_deduction > 0)
      ? sales.reduce((sum, sale) => sum + brokerTaxInr(sale), 0)
      : null);
  const stale = !privateCompany && lot?.price_date && isStale(lot.price_date, today);
  const details = lot
    ? [
        item('Allotment', formatDate(lot.allotted_on)),
        item('Gross FMV', money(lot.gross_fmv, lot.currency)),
        item('FMV basis per share', money(lot.basis_per_share_inr)),
        item('Withheld or sold for tax', units(lot.tax_units)),
        item('Net shares received', units(lot.allotted_on ? lot.quantity - lot.tax_units : 0)),
        item('Voluntarily sold', units(lot.sold_units)),
        item('Shares held', units(lot.held_units)),
        item('Quote as of', `${formatDate(lot.price_date)}${stale ? ' · Stale' : ''}`),
        item('Recorded tax', money(recordedTax)),
        item('Realized P&L', money(realized)),
        item('Realized return', percent(soldBasis ? (realized / soldBasis) * 100 : null)),
        item('Unrealized P&L', money(lot.unrealized_inr)),
        item('Unrealized return', percent(lot.unrealized_return)),
      ]
    : [];
  if (lot && event.kind === 'exercise') {
    details.unshift(
      item('Purchase cost', money(lot.purchase_cost_inr)),
      item('Perquisite', money(lot.perquisite, lot.currency)),
      item(
        'Acquisition expenses',
        lot.acquisition_expenses_inr === null
          ? '—'
          : money(
              lot.acquisition_expenses_inr + (lot.tax_paid_inr === null ? (recordedTax ?? 0) : 0),
            ),
      ),
    );
  }
  return {
    id: event.id,
    name: grantName,
    subtitle,
    date: event.occurred_on,
    quantity: event.quantity,
    value: lot?.value_inr ?? null,
    status:
      event.kind === 'exercise'
        ? event.allotted_on
          ? 'Allotted'
          : 'Awaiting allotment'
        : 'Vested',
    entity: event,
    details,
  };
}

export function saleRow(
  sale: EquitySale,
  company: string,
  portfolio: string,
  details: readonly EquitySaleDetail[],
  grantNames: ReadonlyMap<string, string>,
): EquityRow {
  const gross = details.reduce((sum, a) => sum + (a.gross ?? 0), 0);
  const net = details.reduce((sum, a) => sum + (a.net ?? 0), 0);
  const basis = details.reduce((sum, a) => sum + (a.basis_inr ?? 0), 0);
  const credit = details.reduce((sum, a) => sum + (a.bank_inr ?? 0), 0);
  const realized = details.reduce((sum, a) => sum + (a.realized_inr ?? 0), 0);
  return {
    id: sale.id,
    name: company,
    subtitle: portfolio,
    date: sale.sold_on,
    quantity: details.reduce((sum, a) => sum + a.quantity, 0),
    value: realized,
    status: sale.bank_on ? 'Reconciled' : 'Trade FX estimate',
    entity: sale,
    details: [
      item('Gross proceeds', money(gross, sale.currency)),
      item('Net after fees', money(net, sale.currency)),
      item('Allocated basis', money(basis)),
      item('Return', percent(basis ? (realized / basis) * 100 : null)),
      item('INR credited', sale.bank_on ? money(credit) : 'Pending'),
      item('Bank credit date', formatDate(sale.bank_on)),
      ...(sale.currency === 'USD'
        ? [item('Effective INR per USD', units(details[0]?.effective_fx ?? null))]
        : []),
      ...details.flatMap((a) => {
        const grant = a.grant_id ? grantNames.get(a.grant_id) : null;
        return [
          item(
            grant ?? 'Acquisition lot',
            `${formatDate(a.allotted_on)} · ${units(a.quantity)} shares · ${a.holding_days ?? 0} days · ${a.classification ?? 'Unclassified'}`,
          ),
          ...(a.exercise_deduction || a.tax_deduction
            ? [
                item('Exercise cost deducted', money(a.exercise_deduction, sale.currency)),
                item('Tax deducted', money(a.tax_deduction, sale.currency)),
                item('Payout after deductions', money(a.payout, sale.currency)),
              ]
            : []),
          item('Lot basis', money(a.basis_inr)),
          item('Lot realized P&L', money(a.realized_inr)),
          item('Lot return', percent(a.return_percent)),
        ];
      }),
    ],
  };
}

export function companyRow(security: EquitySecurity): EquityRow {
  return {
    id: security.id,
    name: security.name,
    subtitle: security.symbol ?? '',
    date: security.private_price_date,
    quantity: null,
    value: null,
    status: security.market === 'PRIVATE' ? 'Private' : `${security.market} listed`,
    entity: security,
    details:
      security.market === 'PRIVATE'
        ? [item('Manual value per share', money(security.private_price, security.currency))]
        : [item('Quote currency', security.currency)],
  };
}
