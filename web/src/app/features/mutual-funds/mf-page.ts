import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { localIsoDate, sumValuations } from '../../core/calc/common';
import { mfTotals } from '../../core/calc/mf';
import {
  MfCurrentValueInput,
  mfPositionKey,
  mfXirr,
  mfXirrByFolio,
} from '../../core/calc/mf-transactions';
import { HoldingsService } from '../../core/data/holdings.service';
import { MfTransaction, MfTransactionsService } from '../../core/data/mf-transactions.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { toCsv } from '../../shared/format/csv';
import { downloadText } from '../../shared/format/download';
import { formatMoney, formatPercent } from '../../shared/format/money';
import { formatDate, formatUnits } from '../../shared/format/number';
import { PlFilter, Sort, filterByPl, matchesSearch, sortRows } from '../../shared/format/sort';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import {
  CardTemplate,
  CellTemplate,
  Column,
  DataTable,
  FooterTemplate,
} from '../../shared/ui/data-table';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { HoldingCard } from '../../shared/ui/holding-card';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { ListToolbar } from '../../shared/ui/list-toolbar';
import { MoneyPipe, PercentPipe } from '../../shared/ui/money.pipe';
import { PlColorDirective } from '../../shared/ui/pl-color.directive';
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
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    CardTemplate,
    CellTemplate,
    DataTable,
    FooterTemplate,
    EditDialog,
    EmptyState,
    ErrorState,
    HoldingCard,
    ListSkeleton,
    ListToolbar,
    MoneyPipe,
    PercentPipe,
    PlColorDirective,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mf-page.html',
  styleUrl: './mf-page.scss',
})
export class MfPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly transactionService = inject(MfTransactionsService);
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
    { label: '1 Day Change', value: 'dayChange' },
  ];

  protected readonly dialog = new DialogForm<MfForm>();
  protected readonly transactionDialog = signal<MfRow | null>(null);

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
  private readonly importedPositions = computed(
    () => new Set(this.transactionService.transactions().map(mfPositionKey)),
  );
  private readonly currentValues = computed<MfCurrentValueInput[]>(() =>
    this.rows().map((row) => ({
      ...row.holding,
      value: row.units === 0 ? 0 : row.value,
    })),
  );
  protected readonly portfolioXirr = computed(() =>
    mfXirr(
      this.transactionService.transactions(),
      this.currentValues(),
      this.portfolios.scopeIds(),
      this.today,
    ),
  );
  private readonly folioXirrMap = computed(
    () =>
      new Map(
        mfXirrByFolio(
          this.transactionService.transactions(),
          this.currentValues(),
          this.portfolios.scopeIds(),
          this.today,
        ).map((summary) => [summary.key, summary.xirr]),
      ),
  );
  protected readonly selectedTransactions = computed<readonly MfTransaction[]>(() => {
    const row = this.transactionDialog();
    if (!row?.folio) return [];
    const position = mfPositionKey(row.holding);
    return this.transactionService
      .transactions()
      .filter((transaction) => mfPositionKey(transaction) === position);
  });
  protected readonly visible = computed(() =>
    sortRows(
      filterByPl(
        this.rows().filter((r) => matchesSearch(this.search(), r.name, r.code, r.folio)),
        this.plFilter(),
      ),
      this.sort(),
    ),
  );
  protected readonly tableFooter = computed(() => {
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
    { key: 'value', header: 'Value', type: 'custom', sortable: true, alignEnd: true },
    { key: 'pl', header: 'P&L', type: 'custom', sortable: true, alignEnd: true },
    { key: 'xirr', header: 'XIRR', type: 'custom', alignEnd: true },
    { key: 'dayChange', header: '1 Day Change', type: 'pl' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected nav(value: number | null): string {
    return formatMoney(value, 'INR', { digits: 2 });
  }

  protected units(value: number): string {
    return formatUnits(value);
  }

  /** "3 Nov" (the year only when it is not this year). */
  protected shortDate(value: string | null): string {
    const text = formatDate(value);
    return value?.startsWith(this.today.slice(0, 4)) ? text.replace(/ \d{4}$/, '') : text;
  }

  protected date(value: string | null): string {
    return formatDate(value);
  }

  protected xirr(value: number | null): string {
    return value === null ? '—' : formatPercent(value * 100);
  }

  protected folioXirr(row: MfRow): number | null {
    if (row.folio === null || !this.importedPositions().has(mfPositionKey(row.holding)))
      return null;
    return this.folioXirrMap().get(`${row.holding.portfolio_id}\u0000${row.folio}`) ?? null;
  }

  protected transactionAmount(value: number | null): string {
    return value === null ? '—' : formatMoney(Math.abs(value));
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

  protected showTransactions(row: MfRow): void {
    this.transactionDialog.set(row);
  }

  protected closeTransactions(): void {
    this.transactionDialog.set(null);
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
