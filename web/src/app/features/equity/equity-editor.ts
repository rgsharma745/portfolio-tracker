import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { localIsoDate } from '../../core/calc/common';
import { EquityService } from '../../core/data/equity.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { formatMoney } from '../../shared/format/money';
import { formatDate, formatUnits } from '../../shared/format/number';
import { DateInput } from '../../shared/ui/date-input';
import { EditDialog } from '../../shared/ui/edit-dialog';
import {
  AllocationInput,
  Draft,
  FieldKey,
  FormField,
  buildPayload,
  emptyAllocation,
  recordTables,
  titles,
  validateFields,
} from './equity-form';

const currencies = [
  { value: 'USD', label: 'USD' },
  { value: 'INR', label: 'INR' },
];
const markets = [
  { value: 'US', label: 'US listed' },
  { value: 'IN', label: 'India listed' },
  { value: 'PRIVATE', label: 'Private' },
];
const awards = [
  { value: 'RSU', label: 'RSU' },
  { value: 'ESOP', label: 'ESOP' },
];

@Component({
  selector: 'app-equity-editor',
  imports: [FormsModule, ButtonModule, InputTextModule, DateInput, EditDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equity-editor.html',
  styleUrl: './equity-editor.scss',
})
export class EquityEditor {
  private readonly equity = inject(EquityService);
  private readonly portfolios = inject(PortfolioService);
  private readonly document = inject(DOCUMENT);
  readonly initial = input.required<Draft | null>();
  readonly closed = output();
  protected readonly draft = signal<Draft | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Partial<Record<FieldKey, string>>>({});
  protected readonly allocationError = signal(false);
  protected readonly today = localIsoDate();

  private readonly securities = computed(() => this.equity.ledger().securities);
  private readonly scopedGrants = computed(() => {
    const draft = this.draft();
    const ids = this.portfolios.scopeIds();
    return this.equity
      .ledger()
      .grants.filter(
        (grant) =>
          ids.includes(grant.portfolio_id) && (draft?.kind !== 'exercise' || grant.kind === 'ESOP'),
      );
  });
  private readonly grant = computed(() =>
    this.scopedGrants().find((grant) => grant.id === this.draft()?.fields.grant),
  );
  private readonly symbol = computed(() =>
    this.securities().find(
      (security) => security.id === (this.grant()?.security_id ?? this.draft()?.fields.security),
    ),
  );

  protected readonly header = computed(() => {
    const draft = this.draft();
    return draft ? `${draft.editing ? 'Edit' : 'Add'} ${titles[draft.kind]}` : '';
  });

  protected readonly availableLots = computed(() => {
    const draft = this.draft();
    if (!draft || draft.kind !== 'sale') return [];
    const ledger = this.equity.ledger();
    const previouslySold = new Map(
      ledger.saleDetails
        .filter((lot) => lot.sale_id === draft.id)
        .map((lot) => [lot.event_id, lot.quantity]),
    );
    return ledger.lots.flatMap((lot) => {
      const available = (lot.held_units ?? 0) + (previouslySold.get(lot.id) ?? 0);
      if (
        lot.security_id !== draft.fields.security ||
        lot.portfolio_id !== draft.fields.portfolio ||
        !lot.allotted_on ||
        lot.allotted_on > (draft.fields.date ?? '') ||
        available <= 0
      )
        return [];
      const grant = ledger.grants.find((g) => g.id === lot.grant_id);
      const fmv = formatMoney(lot.fmv, lot.currency === 'USD' ? 'USD' : 'INR', { digits: 2 });
      return [
        {
          id: lot.id,
          exercise: lot.kind === 'exercise',
          label: `${grant?.label ?? ''} · ${formatDate(lot.allotted_on)} · FMV ${fmv} · ${formatUnits(available, 6)} available`,
        },
      ];
    });
  });

  protected readonly fields = computed<FormField[]>(() => {
    const draft = this.draft();
    if (!draft) return [];
    const currency = draft.fields.currency ?? 'USD';
    const date: FormField = { key: 'date', label: 'Date', type: 'date', required: true };
    const quantity: FormField = {
      key: 'quantity',
      label: 'Quantity',
      type: 'decimal',
      required: true,
      positive: true,
    };
    const price: FormField = { key: 'price', label: 'Price per share', type: 'decimal' };
    const currencyField: FormField = {
      key: 'currency',
      label: 'Currency',
      type: 'select',
      options: currencies,
      required: true,
    };
    const fx: FormField[] =
      currency === 'USD'
        ? [{ key: 'fx', label: 'INR per USD', type: 'decimal', required: true, positive: true }]
        : [];
    const portfolio: FormField = {
      key: 'portfolio',
      label: 'Portfolio',
      type: 'select',
      required: true,
      frozen: draft.editing,
      options: this.portfolios
        .active()
        .filter((p) => this.portfolios.scopeIds().includes(p.id))
        .map((p) => ({ value: p.id, label: p.name })),
    };
    const company: FormField = {
      key: 'security',
      label: 'Company',
      type: 'select',
      required: true,
      frozen: draft.editing,
      options: this.securities().map((s) => ({
        value: s.id,
        label: s.symbol ? `${s.name} · ${s.market}:${s.symbol}` : s.name,
      })),
    };
    const grantField: FormField = {
      key: 'grant',
      label: 'Grant',
      type: 'select',
      required: true,
      frozen: draft.editing,
      options: this.scopedGrants().map((g) => ({
        value: g.id,
        label: `${g.label} · ${this.securities().find((s) => s.id === g.security_id)?.name ?? ''} · ${this.portfolios.active().find((p) => p.id === g.portfolio_id)?.name ?? ''}`,
      })),
    };
    switch (draft.kind) {
      case 'company': {
        const frozen =
          draft.editing && this.equity.ledger().grants.some((g) => g.security_id === draft.id);
        return [
          { key: 'name', label: 'Company name', required: true },
          {
            key: 'market',
            label: 'Market',
            type: 'select',
            options: markets,
            required: true,
            frozen,
          },
          ...(draft.fields.market === 'PRIVATE'
            ? [
                { ...currencyField, frozen },
                { ...price, label: `Manual value per share (${currency})` },
                { ...date, label: 'Valuation date', required: false },
              ]
            : [{ key: 'symbol', label: 'Ticker symbol', required: true, frozen } as const]),
        ];
      }
      case 'grant': {
        const option = draft.fields.award === 'ESOP';
        const awardCurrency = this.symbol()?.currency ?? '';
        return [
          portfolio,
          company,
          { key: 'name', label: 'Grant ID or name', required: true },
          {
            key: 'award',
            label: 'Grant type',
            type: 'select',
            options: awards,
            required: true,
            frozen: draft.editing,
          },
          { ...date, label: 'Grant date' },
          { ...quantity, label: 'Granted quantity' },
          {
            ...price,
            required: option,
            label: `${option ? 'Strike price' : 'Grant price'}${awardCurrency ? ` (${awardCurrency})` : ''}`,
          },
          ...(option
            ? [
                {
                  ...date,
                  key: 'expiry',
                  label: 'Expiry date',
                  required: false,
                  future: true,
                } as const,
              ]
            : []),
        ];
      }
      case 'schedule':
        return [
          grantField,
          { ...date, label: 'Scheduled date', future: true },
          { ...quantity, label: 'Scheduled quantity' },
        ];
      case 'vest':
      case 'exercise': {
        const exercise = draft.kind === 'exercise';
        const grant = this.grant();
        const tranches = this.equity.ledger().schedule.filter((s) => s.grant_id === grant?.id);
        const fields: FormField[] = [
          grantField,
          { ...date, label: exercise ? 'Exercise date' : 'Vesting date' },
          {
            ...quantity,
            label: exercise
              ? 'Exercised quantity before tax'
              : grant?.kind === 'RSU'
                ? 'Vested quantity before tax'
                : 'Vested quantity',
          },
        ];
        if (!exercise && tranches.length) {
          fields.push({
            key: 'schedule',
            label: 'Scheduled tranche',
            type: 'select',
            options: tranches.map((s) => ({
              value: s.id,
              label: `${formatDate(s.scheduled_on)} · ${formatUnits(s.quantity, 6)}`,
            })),
          });
        }
        if (exercise || grant?.kind === 'RSU') {
          fields.push(
            {
              ...date,
              key: 'allotment',
              label: exercise
                ? 'Allotment date (when issued)'
                : 'Allotment date (defaults to vesting date)',
              required: false,
            },
            currencyField,
            ...fx,
            { key: 'fmv', label: `FMV per share (${currency})`, type: 'decimal', required: true },
          );
          if (exercise)
            fields.push(
              { ...price, label: `Exercise price per share (${currency})`, required: true },
              { key: 'fees', label: `Acquisition fees (${currency})`, type: 'decimal' },
            );
          fields.push(
            { key: 'taxUnits', label: 'Shares withheld or sold for tax', type: 'decimal' },
            { key: 'taxPaid', label: 'Actual tax paid (INR)', type: 'decimal' },
          );
        }
        return fields;
      }
      case 'sale':
        return [
          portfolio,
          company,
          { ...date, label: 'Sale date' },
          currencyField,
          ...fx,
          {
            ...price,
            label: `Selling price per share (${currency})`,
            required: true,
            positive: true,
          },
          { key: 'fmv', label: `Brokerage (${currency})`, type: 'decimal' },
          { key: 'fees', label: `Other charges (${currency})`, type: 'decimal' },
          { key: 'bank', label: 'INR credited to bank', type: 'decimal' },
          { ...date, key: 'bankDate', label: 'Bank credit date', required: false },
          { key: 'notes', label: 'Notes', type: 'notes' },
        ];
    }
  });

  constructor() {
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      this.draft.set(initial);
      this.fieldErrors.set({});
      this.allocationError.set(false);
      this.error.set(null);
    });
  }

  protected set(key: FieldKey, value: string): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const fields = { ...draft.fields, [key]: value };
      let allocations = draft.allocations;
      if (key === 'grant') {
        const grant = this.scopedGrants().find((g) => g.id === value);
        const security = this.securities().find((s) => s.id === grant?.security_id);
        fields.schedule = '';
        fields.currency = security?.currency ?? 'USD';
        if (draft.kind === 'exercise' && !draft.editing)
          fields.price = String(grant?.grant_price ?? '');
      }
      if (key === 'currency' && draft.kind === 'exercise' && !draft.editing) {
        fields.price =
          value === this.symbol()?.currency ? String(this.grant()?.grant_price ?? '') : '';
      }
      if (draft.kind === 'sale' && (key === 'security' || key === 'portfolio')) {
        allocations = [emptyAllocation()];
        if (key === 'security') {
          fields.currency = this.securities().find((s) => s.id === value)?.currency ?? 'USD';
        }
      }
      return { ...draft, fields, allocations };
    });
    this.fieldErrors.update((errors) => {
      const remaining = { ...errors, [key]: undefined };
      if (key === 'date') delete remaining.allotment;
      if (key === 'quantity') delete remaining.taxUnits;
      return remaining;
    });
    this.error.set(null);
  }

  protected changeAllocation(
    key: string,
    field: keyof Omit<AllocationInput, 'key'>,
    value: string,
  ): void {
    this.draft.update(
      (draft) =>
        draft && {
          ...draft,
          allocations: draft.allocations.map((a) =>
            a.key !== key
              ? a
              : {
                  ...a,
                  [field]: value,
                  ...(field === 'lot' ? { exercise: '', tax: '' } : {}),
                },
          ),
        },
    );
    this.allocationError.set(false);
    this.error.set(null);
  }

  protected allocationOptions(allocation: AllocationInput) {
    const picked = this.draft()?.allocations ?? [];
    return this.availableLots().filter(
      (lot) => lot.id === allocation.lot || !picked.some((a) => a.lot === lot.id),
    );
  }

  protected isExerciseLot(id: string): boolean {
    return this.availableLots().some((lot) => lot.id === id && lot.exercise);
  }

  protected addAllocation(): void {
    this.draft.update(
      (draft) =>
        draft && {
          ...draft,
          allocations: [...draft.allocations, emptyAllocation()],
        },
    );
  }

  protected removeAllocation(key: string): void {
    this.draft.update(
      (draft) =>
        draft && {
          ...draft,
          allocations: draft.allocations.filter((a) => a.key !== key),
        },
    );
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    const errors = validateFields(draft, this.fields(), this.today);
    this.fieldErrors.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      this.document.getElementById(`equity-${first}`)?.focus();
      return;
    }
    const payload = buildPayload(draft, this.grant());
    if (!payload) {
      this.allocationError.set(true);
      this.document.getElementById('equity-allocations')?.focus();
      return;
    }
    await this.write(() =>
      'sale' in payload
        ? this.equity.saveSale(payload.sale)
        : this.equity.save(payload.record, draft.id),
    );
  }

  protected async remove(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    await this.write(() =>
      this.equity.remove(recordTables[draft.kind], draft.id, draft.fields.portfolio ?? ''),
    );
  }

  private async write(save: () => Promise<string | null>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const error = await save();
      if (error) this.error.set(error);
      else this.closed.emit();
    } catch {
      this.error.set('Could not save. Check your connection and try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
