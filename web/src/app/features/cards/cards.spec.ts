import type { CardBill } from '../../core/data/cards.service';
import { buildBillRows, dueLabel } from './bill-rows';
import {
  billFormFrom,
  cardFormFrom,
  emptyCardForm,
  validateBillForm,
  validateCardForm,
} from './card-forms';

const TODAY = '2026-11-04';

const bill = (over: Partial<CardBill>): CardBill => ({
  id: 'b',
  owner_id: 'o',
  card_id: 'c',
  card_name: 'Card',
  portfolio_id: 'me',
  statement_month: '2026-11-01',
  due_date: '2026-11-20',
  amount: 1000,
  paid_amount: 0,
  paid_on: null,
  notes: null,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('buildBillRows', () => {
  it('puts overdue first, then by due date, and paid last', () => {
    const rows = buildBillRows(
      [
        bill({ id: 'paid', due_date: '2026-11-01', paid_amount: 1000 }),
        bill({ id: 'later', due_date: '2026-11-25' }),
        bill({ id: 'awaiting', due_date: '2026-11-10', amount: null }),
        bill({ id: 'overdue', due_date: '2026-11-02' }),
        bill({ id: 'partial', due_date: '2026-11-08', paid_amount: 200 }),
      ],
      new Map([['me', 'Me']]),
      TODAY,
    );
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['overdue', 'overdue'],
      ['partial', 'partial'],
      ['awaiting', 'awaiting'],
      ['later', 'unpaid'],
      ['paid', 'paid'],
    ]);
    expect(rows[1]).toMatchObject({ balance: 800, portfolio: 'Me' });
  });
});

describe('dueLabel', () => {
  it.each([
    ['2026-11-04', 'today'],
    ['2026-11-05', 'tomorrow'],
    ['2026-11-09', 'in 5 days'],
    ['2026-11-03', '1 day overdue'],
    ['2026-10-31', '4 days overdue'],
  ])('%s is %s', (due, label) => {
    expect(dueLabel(due, TODAY)).toBe(label);
  });
});

describe('validateCardForm', () => {
  it('accepts a card with or without days', () => {
    expect(
      validateCardForm({ ...emptyCardForm('me'), name: ' Rewards ', billDay: '14', dueDay: '3' })
        .value,
    ).toEqual({
      portfolio_id: 'me',
      name: 'Rewards',
      bank: null,
      bill_day: 14,
      due_day: 3,
      is_active: true,
    });
    expect(validateCardForm({ ...emptyCardForm('me'), name: 'X' }).value).toMatchObject({
      bill_day: null,
      due_day: null,
    });
  });

  it('checks the name and the days', () => {
    expect(validateCardForm({ ...emptyCardForm(''), billDay: '32', dueDay: '2.5' }).errors).toEqual(
      {
        portfolioId: 'Choose a portfolio.',
        name: 'Enter a name for the card.',
        billDay: 'Use a day from 1 to 31.',
        dueDay: 'Use a day from 1 to 31.',
      },
    );
  });

  it('round-trips a saved card', () => {
    const form = cardFormFrom({
      id: 'c',
      owner_id: 'o',
      portfolio_id: 'me',
      name: 'Travel',
      bank: 'HDFC',
      bill_day: 1,
      due_day: 20,
      is_active: false,
      created_at: '',
      updated_at: '',
    });
    expect(validateCardForm(form).value).toMatchObject({ bank: 'HDFC', is_active: false });
  });
});

describe('validateBillForm', () => {
  it('saves an empty amount as "awaiting statement"', () => {
    const form = { ...billFormFrom(bill({ amount: null })), notes: ' paid by UPI ' };
    expect(validateBillForm(form).value).toEqual({
      amount: null,
      paid_amount: 0,
      paid_on: null,
      due_date: '2026-11-20',
      notes: 'paid by UPI',
    });
  });

  it('records a partial payment', () => {
    const form = { ...billFormFrom(bill({})), paid: '400', paidOn: '2026-11-04' };
    expect(validateBillForm(form).value).toMatchObject({
      amount: 1000,
      paid_amount: 400,
      paid_on: '2026-11-04',
    });
  });

  it('checks numbers, dates and note length', () => {
    expect(
      validateBillForm({
        amount: '-1',
        paid: 'x',
        paidOn: 'later',
        dueDate: '',
        notes: 'n'.repeat(201),
      }).errors,
    ).toEqual({
      amount: 'Must be zero or more.',
      paid: 'Enter a number, e.g. 1250.50.',
      paidOn: 'Pick a date.',
      dueDate: 'Pick the due date.',
      notes: 'Use at most 200 characters.',
    });
  });
});
