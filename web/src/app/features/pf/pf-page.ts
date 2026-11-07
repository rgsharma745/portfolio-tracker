import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { localIsoDate } from '../../core/calc/common';
import {
  PfContributionType,
  WAGE_MONTHS,
  WagePeriod,
  fyLabel,
  fyStart,
  latestCompany,
  pfByCompany,
  pfTotals,
  wageKey,
  wageLabel,
  wagePeriod,
} from '../../core/calc/pf';
import { PfEntry, PfService } from '../../core/data/pf.service';
import { PortfolioService } from '../../core/data/portfolio.service';
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
import {
  COMPANY_NAME_MAX,
  FIRST_YEAR,
  PfForm,
  emptyPfForm,
  interestForm,
  nextMonthForm,
  pfFormFrom,
  switchType,
  validatePfForm,
} from './pf-form';

export interface PfRow {
  id: string;
  entry: PfEntry;
  /** `YYYY-MM-DD`, also the default sort key. */
  date: string;
  dateLabel: string;
  /** Sortable wage period (interest rows sort by date as a stand-in). */
  wageSort: number;
  /** "Mar 2025", or null for interest. */
  wageLabel: string | null;
  company: string;
  portfolio: string;
  type: PfContributionType;
  /** Financial year of the transaction date (the passbook's year). */
  fy: number;
  employee: number;
  employer: number;
  pension: number;
}

const ALL = '';

/** "Mar 2025" for a monthly row, "Interest" for an interest row (for labels). */
export function rowTitle(row: Pick<PfRow, 'type' | 'wageLabel'>): string {
  return row.type === 'interest' ? 'Interest' : (row.wageLabel ?? '');
}

/** Provident fund: balance, pension apart, by company, and the passbook. */
@Component({
  selector: 'app-pf-page',
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
  templateUrl: './pf-page.html',
  styleUrl: './pf-page.scss',
})
export class PfPage {
  protected readonly pf = inject(PfService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly companyMax = COMPANY_NAME_MAX;
  private readonly today = localIsoDate();

  protected readonly dialog = new DialogForm<PfForm>();
  protected readonly companyFilter = signal(ALL);
  protected readonly fyFilter = signal<number | null>(null);
  protected readonly sort = signal<Sort>({ key: 'date', order: -1 });

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly names = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  private readonly scoped = computed(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.pf.entries().filter((e) => ids.has(e.portfolio_id));
  });

  protected readonly totals = computed(() =>
    pfTotals(this.pf.entries(), this.portfolios.scopeIds()),
  );
  protected readonly companies = computed(() =>
    pfByCompany(this.pf.entries(), this.portfolios.scopeIds()).map((c) => ({
      ...c,
      portfolio: this.names().get(c.portfolioId) ?? '',
    })),
  );

  protected readonly rows = computed<PfRow[]>(() =>
    this.scoped().map((entry) => {
      const wage = wagePeriod(entry);
      const type: PfContributionType =
        entry.contribution_type === 'interest' ? 'interest' : 'monthly';
      return {
        id: entry.id,
        entry,
        date: entry.transaction_date,
        dateLabel: formatDate(entry.transaction_date),
        wageSort: wage ? wageKey(wage) : 0,
        wageLabel: wage ? wageLabel(wage) : null,
        company: entry.company,
        portfolio: this.names().get(entry.portfolio_id) ?? '',
        type,
        fy: fyStart(entry.transaction_date),
        employee: entry.employee_amount,
        employer: entry.employer_amount,
        pension: entry.pension_amount,
      };
    }),
  );
  protected readonly visible = computed(() =>
    sortRows(
      this.rows().filter(
        (r) =>
          (this.companyFilter() === ALL || r.company === this.companyFilter()) &&
          (this.fyFilter() === null || r.fy === this.fyFilter()),
      ),
      this.sort(),
    ),
  );
  protected readonly footer = computed(() =>
    this.visible().reduce(
      (t, r) => ({
        employee: t.employee + r.employee,
        employer: t.employer + r.employer,
        pension: t.pension + r.pension,
      }),
      { employee: 0, employer: 0, pension: 0 },
    ),
  );

  protected readonly companyOptions = computed(() => [
    { label: 'All companies', value: ALL },
    ...[...new Set(this.rows().map((r) => r.company))]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ label: c, value: c })),
  ]);
  protected readonly fyOptions = computed(() => [
    { label: 'All years', value: null },
    ...[...new Set(this.rows().map((r) => r.fy))]
      .sort((a, b) => b - a)
      .map((fy) => ({ label: fyLabel(fy), value: fy })),
  ]);
  /** Company names already used, offered as suggestions in the dialog. */
  protected readonly knownCompanies = computed(() =>
    [...new Set(this.pf.entries().map((e) => e.company))].sort((a, b) => a.localeCompare(b)),
  );

  protected readonly columns: Column<PfRow>[] = [
    { key: 'date', header: 'Credited', type: 'custom', sortable: true },
    { key: 'wageSort', header: 'Wage month', type: 'custom', sortable: true },
    { key: 'company', header: 'Company', type: 'custom', sortable: true },
    { key: 'employee', header: 'Employee', type: 'money' },
    { key: 'employer', header: 'Employer', type: 'money' },
    { key: 'pension', header: 'Pension (EPS)', type: 'money' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly typeOptions = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Interest', value: 'interest' },
  ];
  protected readonly monthOptions = WAGE_MONTHS.map((label, i) => ({ label, value: i + 1 }));
  protected readonly yearOptions = this.years().map((y) => ({ label: String(y), value: y }));
  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected readonly dialogTitle = computed(() => {
    if (this.dialog.isEdit()) return 'Edit PF entry';
    return this.dialog.form().type === 'interest' ? 'Add interest' : 'Add PF month';
  });
  /** "Counts for FY 2025–26" under the transaction date of an interest row. */
  protected readonly interestHint = computed(() => {
    const date = this.dialog.form().transactionDate;
    return /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? `Counts for ${fyLabel(fyStart(date))}, the year of this date.`
      : '';
  });

  private years(): number[] {
    const last = Number(this.today.slice(0, 4)) + 1;
    return Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => last - i);
  }

  private defaultPortfolio(): string {
    return this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
  }

  protected fyText(fy: number): string {
    return fyLabel(fy);
  }

  protected wageText(wage: WagePeriod | null): string {
    return wage ? wageLabel(wage) : '—';
  }

  protected title(row: PfRow): string {
    return rowTitle(row);
  }

  /** The next wage month for the company paid most recently (a new company if there is none). */
  protected addNextMonth(): void {
    const latest = latestCompany(this.pf.entries(), this.portfolios.scopeIds());
    if (latest) this.addNextFor(latest.company, latest.portfolioId);
    else this.addCompany();
  }

  protected addNextFor(company: string, portfolioId: string): void {
    this.dialog.show(nextMonthForm(this.pf.entries(), company, portfolioId, this.today));
  }

  protected addCompany(): void {
    this.dialog.show(emptyPfForm(this.defaultPortfolio(), '', this.today));
  }

  protected addInterest(): void {
    const latest = latestCompany(this.pf.entries(), this.portfolios.scopeIds());
    this.dialog.show(
      interestForm(
        latest?.portfolioId ?? this.defaultPortfolio(),
        latest?.company ?? '',
        this.today,
      ),
    );
  }

  /** Switching between Monthly and Interest keeps the company; amounts start fresh. */
  protected setType(type: PfContributionType): void {
    this.dialog.form.set(switchType(this.dialog.form(), type, this.pf.entries(), this.today));
  }

  /** Picking a known company while adding a month refills its next wage month and amounts. */
  protected setCompany(company: string): void {
    this.dialog.set('company', company);
    const form = this.dialog.form();
    const known = this.pf
      .entries()
      .some(
        (e) =>
          e.company === company &&
          e.portfolio_id === form.portfolioId &&
          e.contribution_type === 'monthly',
      );
    if (!this.dialog.isEdit() && form.type === 'monthly' && known) {
      this.dialog.form.set(nextMonthForm(this.pf.entries(), company, form.portfolioId, this.today));
    }
  }

  protected edit(row: PfRow): void {
    this.dialog.show(pfFormFrom(row.entry), row.id);
  }

  protected clearFilters(): void {
    this.companyFilter.set(ALL);
    this.fyFilter.set(null);
  }

  protected save(): void {
    void this.dialog.submit(validatePfForm, (value, id) => this.pf.save(value, id ?? undefined));
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.pf.remove(id));
  }
}
