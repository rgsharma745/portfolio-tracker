import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { fyLabel, fyStart, localIsoDate } from '../../core/calc/common';
import {
  PPF_YEARLY_MAX,
  PPF_YEARLY_MIN,
  PpfEntryType,
  PpfYearRow,
  ppfAccountKey,
  ppfByAccount,
  ppfByFinancialYear,
  ppfThisYear,
  ppfTotals,
} from '../../core/calc/ppf';
import { PortfolioService } from '../../core/data/portfolio.service';
import { PpfEntry, PpfService } from '../../core/data/ppf.service';
import { formatMoney } from '../../shared/format/money';
import { formatDate } from '../../shared/format/number';
import { Sort, sortRows } from '../../shared/format/sort';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import {
  CardTemplate,
  CellTemplate,
  Column,
  DataTable,
  FooterTemplate,
} from '../../shared/ui/data-table';
import { DateInput } from '../../shared/ui/date-input';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import { ACCOUNT_NAME_MAX, PpfForm, emptyPpfForm, ppfFormFrom, validatePpfForm } from './ppf-form';

export interface PpfRow {
  id: string;
  entry: PpfEntry;
  /** `YYYY-MM-DD`, also the default sort key. */
  date: string;
  dateLabel: string;
  account: string;
  /** {@link ppfAccountKey} of the row's account. */
  accountKey: string;
  portfolio: string;
  type: PpfEntryType;
  fy: number;
  invested: number;
  interest: number;
}

/** "Over ₹1.5 lakh" and "Below ₹500" tags for a year, naming accounts when there are several. */
export function yearFlags(row: PpfYearRow, single: boolean): string[] {
  const named = (prefix: string, names: string[]) =>
    single || names.length === 0 ? prefix : `${prefix}: ${names.join(', ')}`;
  return [
    ...(row.overLimit.length ? [named('Over ₹1.5 lakh', row.overLimit)] : []),
    ...(row.belowMinimum.length ? [named('Below ₹500', row.belowMinimum)] : []),
  ];
}

const ALL = '';

/** Public Provident Fund: balance, investment and interest per financial year, and entries. */
@Component({
  selector: 'app-ppf-page',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TagModule,
    CardTemplate,
    CellTemplate,
    DataTable,
    FooterTemplate,
    DateInput,
    EditDialog,
    EmptyState,
    ErrorState,
    ListSkeleton,
    MoneyPipe,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ppf-page.html',
  styleUrl: './ppf-page.scss',
})
export class PpfPage {
  protected readonly ppf = inject(PpfService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly accountMax = ACCOUNT_NAME_MAX;
  protected readonly yearlyMin = PPF_YEARLY_MIN;
  protected readonly yearlyMax = PPF_YEARLY_MAX;
  private readonly today = localIsoDate();

  protected readonly dialog = new DialogForm<PpfForm>();
  /** An account key, or ALL. Narrows the per-year table and the entries. */
  protected readonly accountFilter = signal(ALL);
  protected readonly fyFilter = signal<number | null>(null);
  protected readonly sort = signal<Sort>({ key: 'date', order: -1 });

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly names = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );

  protected readonly totals = computed(() =>
    ppfTotals(this.ppf.entries(), this.portfolios.scopeIds()),
  );
  protected readonly thisYear = computed(() =>
    ppfThisYear(this.ppf.entries(), this.portfolios.scopeIds(), this.today),
  );
  protected readonly thisYearLabel = fyLabel(fyStart(this.today));
  protected readonly thisYearNote = computed(() => {
    const { roomLeft, accounts } = this.thisYear();
    if (roomLeft === null) return `${this.thisYearLabel}, across ${accounts} accounts`;
    return roomLeft > 0
      ? `${formatMoney(roomLeft)} left of ${formatMoney(PPF_YEARLY_MAX)}`
      : `${formatMoney(PPF_YEARLY_MAX)} limit reached`;
  });

  protected readonly accounts = computed(() =>
    ppfByAccount(this.ppf.entries(), this.portfolios.scopeIds()).map((a) => ({
      ...a,
      portfolio: this.names().get(a.portfolioId) ?? '',
    })),
  );
  /** The selected account, if it is still in scope (switching portfolio can drop it). */
  private readonly selectedAccount = computed(() => {
    const key = this.accountFilter();
    return this.accounts().some((a) => a.key === key) ? key : null;
  });

  protected readonly years = computed(() =>
    ppfByFinancialYear(
      this.ppf.entries(),
      this.portfolios.scopeIds(),
      this.today,
      this.selectedAccount(),
    ),
  );
  /** Room left and flags without account names when the table covers one account. */
  protected readonly singleAccount = computed(
    () => this.selectedAccount() !== null || this.accounts().length === 1,
  );
  protected readonly yearTotals = computed(() =>
    this.years().reduce(
      (t, y) => ({ invested: t.invested + y.invested, interest: t.interest + y.interest }),
      { invested: 0, interest: 0 },
    ),
  );

  protected readonly rows = computed<PpfRow[]>(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.ppf
      .entries()
      .filter((e) => ids.has(e.portfolio_id))
      .map((entry) => {
        const interest = entry.entry_type === 'interest';
        return {
          id: entry.id,
          entry,
          date: entry.entry_date,
          dateLabel: formatDate(entry.entry_date),
          account: entry.account,
          accountKey: ppfAccountKey(entry),
          portfolio: this.names().get(entry.portfolio_id) ?? '',
          type: interest ? 'interest' : 'investment',
          fy: fyStart(entry.entry_date),
          invested: interest ? 0 : entry.amount,
          interest: interest ? entry.amount : 0,
        };
      });
  });
  protected readonly visible = computed(() => {
    const account = this.selectedAccount();
    return sortRows(
      this.rows().filter(
        (r) =>
          (account === null || r.accountKey === account) &&
          (this.fyFilter() === null || r.fy === this.fyFilter()),
      ),
      this.sort(),
    );
  });
  protected readonly footer = computed(() =>
    this.visible().reduce(
      (t, r) => ({ invested: t.invested + r.invested, interest: t.interest + r.interest }),
      { invested: 0, interest: 0 },
    ),
  );

  protected readonly accountOptions = computed(() => [
    { label: 'All accounts', value: ALL },
    ...this.accounts().map((a) => ({
      label: this.showPortfolio() ? `${a.account} (${a.portfolio})` : a.account,
      value: a.key,
    })),
  ]);
  protected readonly fyOptions = computed(() => [
    { label: 'All years', value: null },
    ...[...new Set(this.rows().map((r) => r.fy))]
      .sort((a, b) => b - a)
      .map((fy) => ({ label: fyLabel(fy), value: fy })),
  ]);
  /** Account names already used, offered as suggestions in the dialog. */
  protected readonly knownAccounts = computed(() =>
    [...new Set(this.ppf.entries().map((e) => e.account))].sort((a, b) => a.localeCompare(b)),
  );

  protected readonly yearColumns: Column<PpfYearRow>[] = [
    { key: 'label', header: 'Financial year', type: 'custom', sortable: false },
    { key: 'invested', header: 'Investment', type: 'money', sortable: false },
    { key: 'interest', header: 'Interest', type: 'money', sortable: false },
    { key: 'closingBalance', header: 'Closing balance', type: 'money', sortable: false },
    { key: 'roomLeft', header: 'Room left', type: 'custom', sortable: false, alignEnd: true },
  ];
  protected readonly columns: Column<PpfRow>[] = [
    { key: 'date', header: 'Date', type: 'custom', sortable: true },
    { key: 'account', header: 'Account', type: 'custom', sortable: true },
    { key: 'invested', header: 'Investment', type: 'money' },
    { key: 'interest', header: 'Interest', type: 'money' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly typeOptions = [
    { label: 'Investment', value: 'investment' },
    { label: 'Interest', value: 'interest' },
  ];
  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected readonly dialogTitle = computed(() => {
    if (this.dialog.isEdit()) return 'Edit PPF entry';
    return this.dialog.form().type === 'interest' ? 'Add PPF interest' : 'Add PPF investment';
  });
  /** "Counts for FY 2025–26" under the date. */
  protected readonly dateHint = computed(() => {
    const date = this.dialog.form().date;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `Counts for ${fyLabel(fyStart(date))}.` : '';
  });

  private defaultPortfolio(): string {
    return this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
  }

  protected flags(row: PpfYearRow): string[] {
    return yearFlags(row, this.singleAccount());
  }

  protected add(type: PpfEntryType = 'investment'): void {
    const only = this.accounts().length === 1 ? this.accounts()[0] : null;
    this.dialog.show(
      emptyPpfForm(
        only?.portfolioId ?? this.defaultPortfolio(),
        only?.account ?? '',
        this.today,
        type,
      ),
    );
  }

  protected addFor(account: string, portfolioId: string, type: PpfEntryType): void {
    this.dialog.show(emptyPpfForm(portfolioId, account, this.today, type));
  }

  protected edit(row: PpfRow): void {
    this.dialog.show(ppfFormFrom(row.entry), row.id);
  }

  protected clearFilters(): void {
    this.accountFilter.set(ALL);
    this.fyFilter.set(null);
  }

  protected save(): void {
    void this.dialog.submit(validatePpfForm, (value, id) => this.ppf.save(value, id ?? undefined));
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.ppf.remove(id));
  }
}
