import type {
  CardBill,
  CardBillUpdate,
  CreditCard,
  CreditCardInput,
} from '../../core/data/cards.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import {
  FormErrors,
  nonNegative,
  onlyErrors,
  optionalNonNegative,
} from '../../shared/format/validation';

export const CARD_NAME_MAX = 40;
export const NOTES_MAX = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Card ----

export interface CardForm {
  portfolioId: string;
  name: string;
  bank: string;
  billDay: string;
  dueDay: string;
  isActive: boolean;
}

export function emptyCardForm(portfolioId: string): CardForm {
  return { portfolioId, name: '', bank: '', billDay: '', dueDay: '', isActive: true };
}

export function cardFormFrom(c: CreditCard): CardForm {
  return {
    portfolioId: c.portfolio_id,
    name: c.name,
    bank: c.bank ?? '',
    billDay: numberInputText(c.bill_day),
    dueDay: numberInputText(c.due_day),
    isActive: c.is_active,
  };
}

function dayError(day: number | null): string | undefined {
  if (day === null) return undefined;
  return Number.isInteger(day) && day >= 1 && day <= 31 ? undefined : 'Use a day from 1 to 31.';
}

export function validateCardForm(form: CardForm): {
  errors: FormErrors<CardForm>;
  value: CreditCardInput | null;
} {
  const name = form.name.trim();
  const billDay = parseDecimal(form.billDay);
  const dueDay = parseDecimal(form.dueDay);
  const errors = onlyErrors<CardForm>({
    portfolioId: form.portfolioId ? undefined : 'Choose a portfolio.',
    name: !name
      ? 'Enter a name for the card.'
      : name.length > CARD_NAME_MAX
        ? `Use at most ${CARD_NAME_MAX} characters.`
        : undefined,
    billDay: dayError(billDay),
    dueDay: dayError(dueDay),
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      portfolio_id: form.portfolioId,
      name,
      bank: form.bank.trim() || null,
      bill_day: billDay,
      due_day: dueDay,
      is_active: form.isActive,
    },
  };
}

// ---- Bill ----

export interface BillForm {
  /** Empty = statement not received yet. */
  amount: string;
  paid: string;
  paidOn: string;
  dueDate: string;
  notes: string;
}

export function billFormFrom(b: CardBill): BillForm {
  return {
    amount: numberInputText(b.amount),
    paid: numberInputText(b.paid_amount),
    paidOn: b.paid_on ?? '',
    dueDate: b.due_date,
    notes: b.notes ?? '',
  };
}

export function validateBillForm(form: BillForm): {
  errors: FormErrors<BillForm>;
  value: CardBillUpdate | null;
} {
  const amount = parseDecimal(form.amount);
  const paid = parseDecimal(form.paid);
  const notes = form.notes.trim();
  const errors = onlyErrors<BillForm>({
    amount: optionalNonNegative(amount),
    paid: nonNegative(paid ?? 0, 'the amount paid'),
    paidOn: !form.paidOn || ISO_DATE.test(form.paidOn) ? undefined : 'Pick a date.',
    dueDate: ISO_DATE.test(form.dueDate) ? undefined : 'Pick the due date.',
    notes: notes.length > NOTES_MAX ? `Use at most ${NOTES_MAX} characters.` : undefined,
  });
  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors: {},
    value: {
      amount,
      paid_amount: paid ?? 0,
      paid_on: form.paidOn || null,
      due_date: form.dueDate,
      notes: notes || null,
    },
  };
}
