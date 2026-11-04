import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { localIsoDate, sumValuations } from '../../core/calc/common';
import { mfTotals } from '../../core/calc/mf';
import { HoldingsService } from '../../core/data/holdings.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { toCsv } from '../../shared/format/csv';
import { downloadText } from '../../shared/format/download';
import { formatMoney } from '../../shared/format/money';
import { formatDate } from '../../shared/format/number';
import { PlFilter, Sort, filterByPl, matchesSearch, sortRows } from '../../shared/format/sort';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { CardTemplate, CellTemplate, Column, DataTable } from '../../shared/ui/data-table';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { HoldingCard } from '../../shared/ui/holding-card';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { ListToolbar } from '../../shared/ui/list-toolbar';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import { MfForm, emptyMfForm, mfFormFrom, validateMfForm } from './mf-form';
import { MF_CSV_COLUMNS, MfRow, buildMfRows } from './mf-rows';

/** Mutual funds: totals, search/sort/filter, table or cards, add/edit/delete, CSV export. */
@Component({
  selector: 'app-mf-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    CardTemplate,
    CellTemplate,
    DataTable,
    EditDialog,
    EmptyState,
    ErrorState,
    HoldingCard,
    ListSkeleton,
    ListToolbar,
    MoneyPipe,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mf-page.html',
})
export class MfPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  private readonly today = localIsoDate();

  protected readonly search = signal('');
  protected readonly plFilter = signal<PlFilter>('all');
  protected readonly sort = signal<Sort>({ key: 'value', order: -1 });
  protected readonly sortOptions = [
    { label: 'Current value', value: 'value' },
    { label: 'Name', value: 'name' },
    { label: 'P&L', value: 'pl' },
    { label: 'P&L %', value: 'plPercent' },
    { label: 'Today', value: 'dayChange' },
  ];

  protected readonly dialog = new DialogForm<MfForm>();

  private readonly portfolioNames = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  /** Tag each holding with its portfolio when showing more than one. */
  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);

  protected readonly rows = computed(() =>
    buildMfRows(
      this.holdings.mf(),
      this.holdings.navQuotes(),
      this.portfolioNames(),
      this.portfolios.scopeIds(),
      this.today,
    ),
  );
  protected readonly totals = computed(() =>
    mfTotals(this.holdings.mf(), this.holdings.navQuotes(), this.portfolios.scopeIds(), this.today),
  );
  protected readonly visible = computed(() =>
    sortRows(
      filterByPl(
        this.rows().filter((r) => matchesSearch(this.search(), r.name, r.code, r.folio)),
        this.plFilter(),
      ),
      this.sort(),
    ),
  );
  protected readonly footer = computed(() => {
    const t = sumValuations(this.visible().map((r) => r.valuation));
    return {
      invested: t.invested,
      value: t.value,
      pl: t.pl,
      plPercent: t.plPercent,
      dayChange: t.dayChange,
    };
  });

  protected readonly columns: Column<MfRow>[] = [
    { key: 'name', header: 'Fund', type: 'custom', sortable: true },
    { key: 'units', header: 'Units', type: 'units' },
    { key: 'invested', header: 'Invested', type: 'money' },
    { key: 'nav', header: 'NAV', type: 'custom', sortable: true, alignEnd: true },
    { key: 'navDate', header: 'NAV date', type: 'date' },
    { key: 'value', header: 'Current value', type: 'money' },
    { key: 'pl', header: 'P&L', type: 'pl' },
    { key: 'plPercent', header: 'P&L %', type: 'percent' },
    { key: 'dayChange', header: 'Today', type: 'pl' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected nav(value: number | null): string {
    return formatMoney(value, 'INR', { digits: 4 });
  }

  protected date(value: string | null): string {
    return formatDate(value);
  }

  protected staleTitle(row: MfRow): string {
    return `NAV from ${formatDate(row.navDate)}: older than 4 days`;
  }

  protected add(): void {
    this.dialog.show(emptyMfForm(this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? ''));
  }

  protected edit(row: MfRow): void {
    this.dialog.show(mfFormFrom(row.holding), row.id);
  }

  protected save(): void {
    void this.dialog.submit(validateMfForm, (value, id) =>
      this.holdings.saveMf(value, id ?? undefined),
    );
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.holdings.remove('mf_holdings', id));
  }

  protected exportCsv(): void {
    downloadText(
      `mutual-funds-${this.today}.csv`,
      toCsv(MF_CSV_COLUMNS, this.visible()),
      'text/csv;charset=utf-8',
    );
  }
}
