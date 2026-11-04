import {
  addMonths,
  billBalance,
  billStatus,
  billsToCreate,
  cardDues,
  cardsSummary,
  dueDate,
  earlierUnsettled,
  monthStart,
  nextDue,
} from './cards';

const TODAY = '2026-11-04';

const bill = (
  portfolio_id: string,
  due_date: string,
  amount: number | null,
  paid_amount = 0,
  statement_month = '2026-10-01',
) => ({ portfolio_id, statement_month, due_date, amount, paid_amount });

describe('months', () => {
  it('finds the first of the month', () => {
    expect(monthStart('2026-11-17')).toBe('2026-11-01');
  });

  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-11-01', 1)).toBe('2026-12-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-01', 14)).toBe('2027-05-01');
  });
});

describe('dueDate', () => {
  it('is in the same month when the due day is after the bill day', () => {
    expect(dueDate('2026-11-01', 5, 25)).toBe('2026-11-25');
  });

  it('is in the next month when the due day is before or on the bill day', () => {
    expect(dueDate('2026-11-01', 14, 3)).toBe('2026-12-03');
    expect(dueDate('2026-11-01', 10, 10)).toBe('2026-12-10');
  });

  it('rolls into the next year', () => {
    expect(dueDate('2026-12-01', 20, 8)).toBe('2027-01-08');
  });

  it('uses the last day of a short month', () => {
    expect(dueDate('2026-04-01', 5, 31)).toBe('2026-04-30');
    expect(dueDate('2026-01-01', 31, 30)).toBe('2026-02-28');
    expect(dueDate('2028-01-01', 31, 30)).toBe('2028-02-29');
  });

  it('accepts any date in the statement month', () => {
    expect(dueDate('2026-11-23', 14, 3)).toBe('2026-12-03');
  });
});

describe('billStatus and billBalance', () => {
  const due = '2026-11-10';
  it.each([
    ['awaiting', null, 0, TODAY],
    ['unpaid', 5000, 0, TODAY],
    ['partial', 5000, 2000, TODAY],
    ['paid', 5000, 5000, TODAY],
    ['paid', 5000, 6000, '2026-12-01'],
    ['overdue', 5000, 0, '2026-11-11'],
    ['overdue', 5000, 2000, '2026-11-11'],
    ['unpaid', 5000, 0, due],
    ['paid', 0, 0, '2026-12-01'],
  ] as const)('is %s (amount %s, paid %s, on %s)', (status, amount, paid, today) => {
    expect(billStatus({ amount, paid_amount: paid, due_date: due }, today)).toBe(status);
  });

  it('owes what is left, never less than zero', () => {
    expect(billBalance({ amount: 5000, paid_amount: 2000 })).toBe(3000);
    expect(billBalance({ amount: 5000, paid_amount: 6000 })).toBe(0);
    expect(billBalance({ amount: null, paid_amount: 0 })).toBe(0);
  });
});

describe('totals and next due', () => {
  const bills = [
    bill('me', '2026-11-20', 10000, 4000), // 6,000 left
    bill('me', '2026-11-06', 3000), // urgent: due in 2 days
    bill('me', '2026-11-01', 2000, 2000), // paid
    bill('wife', '2026-11-15', null), // awaiting
    bill('wife', '2026-11-02', 1500, 500), // overdue: 1,000 left
    bill('old', '2026-10-01', 99999),
  ];

  it('adds balances for the portfolios in scope', () => {
    expect(cardDues(bills, ['me'])).toBe(9000);
    expect(cardDues(bills, ['me', 'wife'])).toBe(10000);
  });

  it('picks the earliest bill with a balance', () => {
    const next = nextDue(bills, ['me'], TODAY);
    expect(next?.bill.due_date).toBe('2026-11-06');
    expect(next).toMatchObject({ daysLeft: 2, urgent: true });
  });

  it('includes overdue bills, with negative days left', () => {
    expect(nextDue(bills, ['me', 'wife'], TODAY)).toMatchObject({ daysLeft: -2, urgent: true });
  });

  it('is urgent within 3 days, not 4', () => {
    expect(nextDue([bill('me', '2026-11-07', 1)], ['me'], TODAY)?.urgent).toBe(true);
    expect(nextDue([bill('me', '2026-11-08', 1)], ['me'], TODAY)?.urgent).toBe(false);
  });

  it('is null when nothing is owed', () => {
    expect(nextDue([bill('me', '2026-11-07', null)], ['me'], TODAY)).toBeNull();
  });

  it('summarises pending, awaiting and next due', () => {
    const summary = cardsSummary(bills, ['me', 'wife'], TODAY);
    expect(summary.pending).toBe(10000);
    expect(summary.awaiting).toBe(1);
    expect(summary.nextDue?.bill.due_date).toBe('2026-11-02');
  });
});

describe('earlierUnsettled', () => {
  it('lists unpaid and unentered bills from earlier months, oldest due first', () => {
    const bills = [
      bill('me', '2026-11-03', 1000, 0, '2026-10-01'),
      bill('me', '2026-10-03', null, 0, '2026-09-01'),
      bill('me', '2026-09-03', 500, 500, '2026-08-01'),
      bill('me', '2026-12-03', 700, 0, '2026-11-01'),
    ];
    expect(earlierUnsettled(bills, '2026-11-15', TODAY).map((b) => b.due_date)).toEqual([
      '2026-10-03',
      '2026-11-03',
    ]);
  });
});

describe('billsToCreate', () => {
  const card = (id: string, bill_day: number | null, due_day: number | null, is_active = true) => ({
    id,
    portfolio_id: 'me',
    bill_day,
    due_day,
    is_active,
  });

  it('adds a bill for each active card without one this month', () => {
    const result = billsToCreate(
      [card('a', 14, 3), card('b', 5, 25), card('c', 1, 20), card('off', 1, 20, false)],
      [
        { card_id: 'c', statement_month: '2026-11-01' },
        { card_id: 'a', statement_month: '2026-10-01' },
      ],
      '2026-11-04',
    );
    expect(result).toEqual({
      bills: [
        { card_id: 'a', statement_month: '2026-11-01', due_date: '2026-12-03' },
        { card_id: 'b', statement_month: '2026-11-01', due_date: '2026-11-25' },
      ],
      skipped: [],
    });
  });

  it('skips cards whose due date cannot be computed', () => {
    expect(billsToCreate([card('a', 14, null), card('b', null, 3)], [], TODAY)).toEqual({
      bills: [],
      skipped: ['a', 'b'],
    });
  });
});
