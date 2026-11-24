import type { Database } from '../../core/db.types';
import type {
  EquityEvent,
  EquityGrant,
  EquityRecord,
  EquitySale,
  EquitySaleDetail,
  EquitySchedule,
  EquitySecurity,
} from '../../core/data/equity.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';

export type DraftKind = 'company' | 'grant' | 'schedule' | 'vest' | 'exercise' | 'sale';
export type EquityEntity = EquitySecurity | EquityGrant | EquitySchedule | EquityEvent | EquitySale;

export type FieldKey =
  | 'name'
  | 'market'
  | 'symbol'
  | 'currency'
  | 'portfolio'
  | 'security'
  | 'grant'
  | 'schedule'
  | 'award'
  | 'date'
  | 'allotment'
  | 'quantity'
  | 'price'
  | 'fmv'
  | 'fees'
  | 'taxUnits'
  | 'taxPaid'
  | 'fx'
  | 'bank'
  | 'bankDate'
  | 'expiry'
  | 'notes';

export type Fields = Partial<Record<FieldKey, string>>;
export interface AllocationInput {
  key: string;
  lot: string;
  quantity: string;
  exercise: string;
  tax: string;
}

export interface Draft {
  kind: DraftKind;
  id: string;
  editing: boolean;
  fields: Fields;
  allocations: AllocationInput[];
}

export const titles: Record<DraftKind, string> = {
  company: 'company',
  grant: 'grant',
  schedule: 'vesting tranche',
  vest: 'vesting',
  exercise: 'exercise',
  sale: 'sale',
};

export function emptyAllocation(): AllocationInput {
  return { key: crypto.randomUUID(), lot: '', quantity: '', exercise: '', tax: '' };
}

export function newDraft(kind: DraftKind, fields: Fields): Draft {
  return {
    kind,
    id: crypto.randomUUID(),
    editing: false,
    fields,
    allocations: kind === 'sale' ? [emptyAllocation()] : [],
  };
}

export function editDraft(row: EquityEntity, details: readonly EquitySaleDetail[] = []): Draft {
  let draft: Draft;
  if ('sold_on' in row) {
    draft = newDraft('sale', {
      date: row.sold_on,
      security: row.security_id,
      portfolio: row.portfolio_id,
      price: numberInputText(row.price),
      fees: numberInputText(row.other_fees),
      fmv: numberInputText(row.brokerage),
      currency: row.currency,
      fx: numberInputText(row.fx),
      bank: numberInputText(row.bank_inr),
      bankDate: row.bank_on ?? '',
      notes: row.notes ?? '',
    });
    draft.allocations = details.map((a) => ({
      key: a.id,
      lot: a.event_id,
      quantity: numberInputText(a.quantity),
      exercise: numberInputText(a.exercise_deduction),
      tax: numberInputText(a.tax_deduction),
    }));
  } else if ('market' in row) {
    draft = newDraft('company', {
      name: row.name,
      market: row.market,
      symbol: row.symbol ?? '',
      currency: row.currency,
      price: numberInputText(row.private_price),
      date: row.private_price_date ?? '',
    });
  } else if ('granted_on' in row) {
    draft = newDraft('grant', {
      name: row.label,
      award: row.kind,
      date: row.granted_on,
      expiry: row.expires_on ?? '',
      quantity: numberInputText(row.quantity),
      price: numberInputText(row.grant_price),
      portfolio: row.portfolio_id,
      security: row.security_id,
    });
  } else if ('scheduled_on' in row) {
    draft = newDraft('schedule', {
      grant: row.grant_id,
      date: row.scheduled_on,
      quantity: numberInputText(row.quantity),
      portfolio: row.portfolio_id,
    });
  } else {
    draft = newDraft(row.kind === 'exercise' ? 'exercise' : 'vest', {
      grant: row.grant_id,
      date: row.occurred_on,
      allotment: row.allotted_on ?? '',
      quantity: numberInputText(row.quantity),
      schedule: row.schedule_id ?? '',
      currency: row.currency ?? 'USD',
      fx: numberInputText(row.fx),
      fmv: numberInputText(row.fmv),
      price: numberInputText(row.purchase_price),
      fees: numberInputText(row.fees),
      taxUnits: numberInputText(row.tax_units),
      taxPaid: numberInputText(row.tax_paid_inr),
      portfolio: row.portfolio_id,
    });
  }
  return { ...draft, id: row.id, editing: true };
}

export interface FormField {
  key: FieldKey;
  label: string;
  type?: 'date' | 'decimal' | 'select' | 'notes';
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  frozen?: boolean;
  positive?: boolean;
  future?: boolean;
}

export type SavePayload =
  { record: EquityRecord } | { sale: Database['public']['Functions']['save_equity_sale']['Args'] };

export const recordTables: Record<DraftKind, EquityRecord['table'] | 'equity_sales'> = {
  company: 'equity_securities',
  grant: 'equity_grants',
  schedule: 'equity_schedule',
  vest: 'equity_events',
  exercise: 'equity_events',
  sale: 'equity_sales',
};

export function validateFields(
  draft: Draft,
  definitions: readonly FormField[],
  today: string,
): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const field of definitions) {
    const value = draft.fields[field.key]?.trim();
    if (field.required && !value) {
      errors[field.key] = 'Enter or select a value.';
    } else if (value && field.type === 'decimal') {
      const amount = parseDecimal(value);
      if (amount === null || !Number.isFinite(amount) || amount < 0) {
        errors[field.key] = 'Enter a number of zero or more.';
      } else if (field.positive && amount === 0) {
        errors[field.key] = 'Enter a number greater than zero.';
      }
    } else if (value && field.type === 'date' && !field.future && value > today) {
      errors[field.key] = 'Choose today or an earlier date.';
    }
  }
  if (
    draft.kind === 'company' &&
    draft.fields.market !== 'PRIVATE' &&
    !/^[A-Z0-9^][A-Z0-9.^&_-]{0,29}$/.test((draft.fields.symbol ?? '').trim().toUpperCase())
  ) {
    errors.symbol = 'Enter a valid listed symbol.';
  }
  if (
    draft.kind === 'company' &&
    draft.fields.market === 'PRIVATE' &&
    !!draft.fields.price !== !!draft.fields.date
  ) {
    if (draft.fields.price) errors.date = 'Enter the date for this price.';
    else errors.price = 'Enter the share price for this date.';
  }
  if (draft.kind === 'sale' && !!draft.fields.bank !== !!draft.fields.bankDate) {
    if (draft.fields.bank) errors.bankDate = 'Enter the bank credit date.';
    else errors.bank = 'Enter the INR credited.';
  }
  return errors;
}

export function buildPayload(draft: Draft, grant: EquityGrant | undefined): SavePayload | null {
  const get = (key: FieldKey) => draft.fields[key]?.trim() || '';
  const number = (key: FieldKey) => parseDecimal(get(key));
  const currency = get('currency');
  const fx = currency === 'INR' ? 1 : (number('fx') ?? 0);
  const portfolio = grant?.portfolio_id ?? get('portfolio');
  const date = get('date');
  const quantity = number('quantity') ?? 0;
  switch (draft.kind) {
    case 'company': {
      const market = get('market');
      return {
        record: {
          table: 'equity_securities',
          row: {
            name: get('name'),
            market,
            currency: market === 'IN' ? 'INR' : market === 'US' ? 'USD' : currency,
            symbol: market === 'PRIVATE' ? null : get('symbol').toUpperCase(),
            private_price: market === 'PRIVATE' ? number('price') : null,
            private_price_date: market === 'PRIVATE' ? date || null : null,
          },
        },
      };
    }
    case 'grant':
      return {
        record: {
          table: 'equity_grants',
          row: {
            portfolio_id: portfolio,
            security_id: get('security'),
            label: get('name'),
            kind: get('award'),
            granted_on: date,
            quantity,
            grant_price: number('price'),
            expires_on: get('award') === 'ESOP' ? get('expiry') || null : null,
          },
        },
      };
    case 'schedule':
      return {
        record: {
          table: 'equity_schedule',
          row: {
            portfolio_id: portfolio,
            grant_id: get('grant'),
            scheduled_on: date,
            quantity,
          },
        },
      };
    case 'vest':
    case 'exercise': {
      const exercise = draft.kind === 'exercise';
      const acquired = exercise || grant?.kind === 'RSU';
      return {
        record: {
          table: 'equity_events',
          row: {
            portfolio_id: portfolio,
            grant_id: get('grant'),
            kind: draft.kind,
            occurred_on: date,
            quantity,
            schedule_id: exercise ? null : get('schedule') || null,
            allotted_on: acquired ? get('allotment') || (exercise ? null : date) : null,
            fmv: acquired ? number('fmv') : null,
            currency: acquired ? currency : null,
            fx: acquired ? fx : null,
            purchase_price: exercise ? number('price') : null,
            fees: exercise ? (number('fees') ?? 0) : 0,
            tax_units: acquired ? (number('taxUnits') ?? 0) : 0,
            tax_paid_inr: acquired ? number('taxPaid') : null,
          },
        },
      };
    }
    case 'sale': {
      const allocations = draft.allocations.map((a) => ({
        event_id: a.lot,
        quantity: parseDecimal(a.quantity) ?? 0,
        exercise_deduction: parseDecimal(a.exercise) ?? 0,
        tax_deduction: parseDecimal(a.tax) ?? 0,
      }));
      if (
        allocations.some(
          (a) =>
            !a.event_id ||
            !Number.isFinite(a.quantity) ||
            a.quantity <= 0 ||
            !Number.isFinite(a.exercise_deduction) ||
            a.exercise_deduction < 0 ||
            !Number.isFinite(a.tax_deduction) ||
            a.tax_deduction < 0,
        )
      )
        return null;
      if (
        !allocations.length ||
        new Set(allocations.map((a) => a.event_id)).size !== allocations.length
      ) {
        return null;
      }
      return {
        sale: {
          p_id: draft.id,
          p_portfolio: portfolio,
          p_security: get('security'),
          p_sold_on: date,
          p_currency: currency,
          p_fx: fx,
          p_price: number('price') ?? 0,
          p_brokerage: number('fmv') ?? 0,
          p_other_fees: number('fees') ?? 0,
          p_bank_inr: number('bank') ?? undefined,
          p_bank_on: get('bankDate') || undefined,
          p_notes: get('notes') || undefined,
          p_lots: allocations,
        },
      };
    }
  }
}
