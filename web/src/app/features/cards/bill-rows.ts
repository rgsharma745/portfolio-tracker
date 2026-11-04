import { daysBetween } from '../../core/calc/common';
import { BillStatus, billBalance, billStatus } from '../../core/calc/cards';
import type { CardBill } from '../../core/data/cards.service';

export interface BillRow {
  id: string;
  name: string;
  portfolio: string;
  amount: number | null;
  paid: number;
  balance: number;
  dueDate: string;
  status: BillStatus;
  bill: CardBill;
}

export const STATUS_LABEL: Record<BillStatus, string> = {
  awaiting: 'Awaiting statement',
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

export const STATUS_SEVERITY: Record<
  BillStatus,
  'secondary' | 'info' | 'warn' | 'success' | 'danger'
> = {
  awaiting: 'secondary',
  unpaid: 'info',
  partial: 'warn',
  paid: 'success',
  overdue: 'danger',
};

const STATUS_RANK: Record<BillStatus, number> = {
  overdue: 0,
  unpaid: 1,
  partial: 1,
  awaiting: 1,
  paid: 2,
};

export function buildBillRows(
  bills: readonly CardBill[],
  portfolioNames: ReadonlyMap<string, string>,
  today: string,
): BillRow[] {
  return sortBills(
    bills.map((b) => ({
      id: b.id,
      name: b.card_name,
      portfolio: portfolioNames.get(b.portfolio_id) ?? '',
      amount: b.amount,
      paid: b.paid_amount,
      balance: billBalance(b),
      dueDate: b.due_date,
      status: billStatus(b, today),
      bill: b,
    })),
  );
}

/** Overdue first, then by due date (then card name); paid bills last. */
export function sortBills(rows: readonly BillRow[]): BillRow[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.name.localeCompare(b.name),
  );
}

/** "today", "tomorrow", "in 5 days", "1 day overdue", "3 days overdue". */
export function dueLabel(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
}
