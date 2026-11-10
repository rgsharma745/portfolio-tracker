import { daysBetween, daysInMonth, inPortfolios, isoDate, parseIsoDate } from './common';

/**
 * Credit card bills, one row per card per month (docs/DATA_MODEL.md, "Credit card bills").
 * Status is always derived here or in `v_card_bills`, never stored.
 */

export type BillStatus = 'awaiting' | 'unpaid' | 'partial' | 'paid' | 'overdue';

/** A bill due within this many days (or overdue) is urgent. */
export const URGENT_WITHIN_DAYS = 3;

export interface BillInput {
  portfolio_id: string;
  statement_month: string;
  due_date: string;
  /** Null until the statement arrives. */
  amount: number | null;
  paid_amount: number;
}

export interface CardInput {
  id: string;
  portfolio_id: string;
  bill_day: number | null;
  due_day: number | null;
  is_active: boolean;
}

/** First day of the month containing `date`. */
export function monthStart(date: string): string {
  const { year, month } = parseIsoDate(date);
  return isoDate(year, month, 1);
}

/** First day of the month `n` months after (or before, if negative) `month`. */
export function addMonths(month: string, n: number): string {
  const { year, month: m } = parseIsoDate(month);
  const index = year * 12 + (m - 1) + n;
  return isoDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

/**
 * Due date of the statement for `statementMonth` (any date in that month). If the due day
 * is after the bill day the bill is due the same month, otherwise the next month; a due
 * day past the end of the month becomes the month's last day.
 */
export function dueDate(statementMonth: string, billDay: number, dueDay: number): string {
  const dueMonth = addMonths(monthStart(statementMonth), dueDay > billDay ? 0 : 1);
  const { year, month } = parseIsoDate(dueMonth);
  return isoDate(year, month, Math.min(dueDay, daysInMonth(year, month)));
}

/** What is still owed: `max(amount - paid, 0)`, 0 while awaiting the statement. */
export function billBalance(bill: Pick<BillInput, 'amount' | 'paid_amount'>): number {
  return Math.max((bill.amount ?? 0) - bill.paid_amount, 0);
}

export function billStatus(
  bill: Pick<BillInput, 'amount' | 'paid_amount' | 'due_date'>,
  today: string,
): BillStatus {
  if (bill.amount === null) return 'awaiting';
  if (bill.paid_amount >= bill.amount) return 'paid';
  if (bill.due_date < today) return 'overdue';
  return bill.paid_amount > 0 ? 'partial' : 'unpaid';
}

/** "Card dues": the sum of balances of the bills in the given portfolios. */
export function cardDues(bills: readonly BillInput[], portfolioIds: readonly string[]): number {
  return inPortfolios(bills, portfolioIds).reduce((sum, b) => sum + billBalance(b), 0);
}

export interface NextDue<T extends BillInput> {
  bill: T;
  /** Days until the due date; negative when overdue. */
  daysLeft: number;
  urgent: boolean;
}

/** The bill with a balance and the earliest due date, or null if nothing is owed. */
export function nextDue<T extends BillInput>(
  bills: readonly T[],
  portfolioIds: readonly string[],
  today: string,
): NextDue<T> | null {
  const owed = inPortfolios(bills, portfolioIds).filter((b) => billBalance(b) > 0);
  if (!owed.length) return null;
  const bill = owed.reduce((a, b) => (b.due_date < a.due_date ? b : a), owed[0]);
  const daysLeft = daysBetween(today, bill.due_date);
  return { bill, daysLeft, urgent: daysLeft <= URGENT_WITHIN_DAYS };
}

export interface CardsSummary<T extends BillInput> {
  /** Total pending: the sum of balances. */
  pending: number;
  /** Bills still waiting for a statement amount. */
  awaiting: number;
  nextDue: NextDue<T> | null;
}

export function cardsSummary<T extends BillInput>(
  bills: readonly T[],
  portfolioIds: readonly string[],
  today: string,
): CardsSummary<T> {
  const scoped = inPortfolios(bills, portfolioIds);
  return {
    pending: cardDues(scoped, portfolioIds),
    awaiting: scoped.filter((b) => b.amount === null).length,
    nextDue: nextDue(scoped, portfolioIds, today),
  };
}

/** Bills from months before `month` that are not paid yet (including ones never entered). */
export function earlierUnsettled<T extends BillInput>(
  bills: readonly T[],
  month: string,
  today: string,
): T[] {
  const start = monthStart(month);
  return bills
    .filter((b) => b.statement_month < start && billStatus(b, today) !== 'paid')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export interface NewBill {
  card_id: string;
  statement_month: string;
  due_date: string;
}

/**
 * "Create this month's bills": one bill with no amount for every active card that has no
 * bill for `month` yet. Cards without a bill day or due day are returned in `skipped`,
 * because their due date cannot be computed.
 */
export function billsToCreate(
  cards: readonly CardInput[],
  existing: readonly { card_id: string; statement_month: string }[],
  month: string,
): { bills: NewBill[]; skipped: string[] } {
  const statementMonth = monthStart(month);
  const billed = new Set(
    existing.filter((b) => b.statement_month === statementMonth).map((b) => b.card_id),
  );
  const bills: NewBill[] = [];
  const skipped: string[] = [];
  for (const card of cards) {
    if (!card.is_active || billed.has(card.id)) continue;
    if (!card.bill_day || !card.due_day) {
      skipped.push(card.id);
      continue;
    }
    bills.push({
      card_id: card.id,
      statement_month: statementMonth,
      due_date: dueDate(statementMonth, card.bill_day, card.due_day),
    });
  }
  return { bills, skipped };
}
