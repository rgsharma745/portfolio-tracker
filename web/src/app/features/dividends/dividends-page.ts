import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { fyLabel, fyStart, localIsoDate } from '../../core/calc/common';
import {
  DividendMarket,
  DividendSymbolRow,
  DividendYearRow,
  dividendMarket,
  dividendTotals,
  dividendsByFinancialYear,
  dividendsBySymbol,
} from '../../core/calc/dividends';
import { Dividend, DividendsService } from '../../core/data/dividends.service';
import { HoldingsService } from '../../core/data/holdings.service';
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
  DividendForm,
  SYMBOL_MAX,
  dividendFormFrom,
  emptyDividendForm,
  inrAtRate,
  normalizeSymbol,
  validateDividendForm,
} from './dividend-form';

export interface DividendRow {
  id: string;
  dividend: Dividend;
  /** `YYYY-MM-DD`, also the default sort key. */
  date: string;
  dateLabel: string;
  symbol: string;
  market: DividendMarket;
  portfolio: string;
  fy: number;
  inr: number;
  usd: number | null;
}

export type DividendTab = 'years' | 'stocks' | 'entries';
/** A financial year's start, or every year. */
export type DividendYearFilter = number | 'all';

/**
 * Dividends received, in three tabs: totals per financial year, per stock, and the entries.
 * The year filter (all years by default) applies to the stock and entry tabs.
 */
@Component({
  selector: 'app-dividends-page',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TabsModule,
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
  templateUrl: './dividends-page.html',
  styleUrl: './dividends-page.scss',
})
export class DividendsPage {
  protected readonly dividends = inject(DividendsService);
  protected readonly portfolios = inject(PortfolioService);
  private readonly holdings = inject(HoldingsService);
  protected readonly bp = inject(BreakpointService);
  protected readonly symbolMax = SYMBOL_MAX;
  private readonly today = localIsoDate();

  protected readonly formatDate = formatDate;
  protected readonly dialog = new DialogForm<DividendForm>();
  protected readonly tab = signal<DividendTab>('years');
  /** The year picked for the stock and entry tabs. */
  private readonly chosenFy = signal<DividendYearFilter>('all');
  protected readonly sort = signal<Sort>({ key: 'date', order: -1 });

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly names = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );

  protected readonly thisYearLabel = fyLabel(fyStart(this.today));
  protected readonly lastYearLabel = fyLabel(fyStart(this.today) - 1);
  protected readonly totals = computed(() =>
    dividendTotals(this.dividends.entries(), this.portfolios.scopeIds(), this.today),
  );

  protected readonly years = computed(() =>
    dividendsByFinancialYear(this.dividends.entries(), this.portfolios.scopeIds()),
  );
  protected readonly yearTotals = computed(() =>
    this.years().reduce(
      (t, y) => ({
        india: t.india + y.india,
        us: t.us + y.us,
        usd: t.usd + y.usd,
        total: t.total + y.total,
        count: t.count + y.count,
      }),
      { india: 0, us: 0, usd: 0, total: 0, count: 0 },
    ),
  );

  /** The picked year if it still has dividends in scope, else all years. */
  protected readonly selectedFy = computed<DividendYearFilter>(() => {
    const chosen = this.chosenFy();
    return this.years().some((y) => y.fyStart === chosen) ? chosen : 'all';
  });
  protected readonly selectedLabel = computed(() => {
    const fy = this.selectedFy();
    return fy === 'all' ? 'all years' : fyLabel(fy);
  });
  protected readonly fyOptions = computed<{ label: string; value: DividendYearFilter }[]>(() => [
    { label: 'All years', value: 'all' },
    ...this.years().map((y) => ({ label: y.label, value: y.fyStart })),
  ]);

  protected readonly symbols = computed(() => {
    const fy = this.selectedFy();
    return dividendsBySymbol(
      this.dividends.entries(),
      this.portfolios.scopeIds(),
      fy === 'all' ? null : fy,
    );
  });
  protected readonly symbolTotals = computed(() => {
    const fy = this.selectedFy();
    const t = fy === 'all' ? this.yearTotals() : this.years().find((y) => y.fyStart === fy);
    return {
      inr: t?.total ?? 0,
      usd: t && t.usd > 0 ? t.usd : null,
      count: t?.count ?? 0,
    };
  });

  protected readonly rows = computed<DividendRow[]>(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.dividends
      .entries()
      .filter((d) => ids.has(d.portfolio_id))
      .map((d) => ({
        id: d.id,
        dividend: d,
        date: d.paid_on,
        dateLabel: formatDate(d.paid_on),
        symbol: d.symbol,
        market: dividendMarket(d.market),
        portfolio: this.names().get(d.portfolio_id) ?? '',
        fy: fyStart(d.paid_on),
        inr: d.amount_inr,
        usd: d.amount_usd,
      }));
  });
  protected readonly visible = computed(() =>
    sortRows(
      this.rows().filter((r) => this.selectedFy() === 'all' || r.fy === this.selectedFy()),
      this.sort(),
    ),
  );

  /** Symbols to suggest for the dialog's market: stock holdings, then past dividends. */
  protected readonly knownSymbols = computed(() => {
    const market = this.dialog.form().market;
    const fromHoldings = this.holdings
      .stocks()
      .filter((h) => dividendMarket(h.market) === market)
      .map((h) => normalizeSymbol(h.symbol));
    const fromDividends = this.dividends
      .entries()
      .filter((d) => dividendMarket(d.market) === market)
      .map((d) => d.symbol);
    return [...new Set([...fromHoldings, ...fromDividends])].sort((a, b) => a.localeCompare(b));
  });

  protected readonly yearColumns: Column<DividendYearRow>[] = [
    { key: 'label', header: 'Financial year', type: 'custom', sortable: false },
    { key: 'india', header: 'India', type: 'money', sortable: false },
    { key: 'us', header: 'US', type: 'custom', sortable: false, alignEnd: true },
    { key: 'total', header: 'Total', type: 'money', sortable: false },
    { key: 'count', header: 'Entries', type: 'units', sortable: false },
  ];
  protected readonly symbolColumns: Column<DividendSymbolRow>[] = [
    { key: 'symbol', header: 'Symbol', type: 'custom', sortable: false },
    { key: 'inr', header: 'Received', type: 'money', sortable: false },
    { key: 'usd', header: 'In USD', type: 'custom', sortable: false, alignEnd: true },
    { key: 'count', header: 'Entries', type: 'units', sortable: false },
    { key: 'lastPaid', header: 'Last received', type: 'date', sortable: false },
  ];
  protected readonly columns: Column<DividendRow>[] = [
    { key: 'date', header: 'Date', type: 'custom', sortable: true },
    { key: 'symbol', header: 'Symbol', type: 'custom', sortable: true },
    { key: 'inr', header: 'Received', type: 'money' },
    { key: 'usd', header: 'In USD', type: 'custom', sortable: false, alignEnd: true },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly marketOptions = [
    { label: 'India', value: 'IN' },
    { label: 'US', value: 'US' },
  ];
  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected readonly dialogTitle = computed(() =>
    this.dialog.isEdit() ? 'Edit dividend' : 'Add dividend',
  );
  /** "Counts for FY 2025–26" under the date. */
  protected readonly dateHint = computed(() => {
    const date = this.dialog.form().date;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `Counts for ${fyLabel(fyStart(date))}.` : '';
  });
  /** ₹ for the dollar amount at today's rate, offered as a starting point. */
  protected readonly inrHint = computed(() => {
    const form = this.dialog.form();
    return form.market === 'US' ? inrAtRate(form.amountUsd, this.holdings.usdInr()) : null;
  });

  private defaultPortfolio(): string {
    return this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
  }

  protected selectTab(value: string | number | undefined): void {
    if (value === 'years' || value === 'stocks' || value === 'entries') this.tab.set(value);
  }

  protected chooseFy(fy: DividendYearFilter): void {
    this.chosenFy.set(fy);
  }

  /** A year in the per-year table opens it by stock. */
  protected showYear(fy: number): void {
    this.chosenFy.set(fy);
    this.tab.set('stocks');
  }

  protected add(): void {
    this.dialog.show(emptyDividendForm(this.defaultPortfolio(), this.today));
  }

  protected edit(row: DividendRow): void {
    this.dialog.show(dividendFormFrom(row.dividend), row.id);
  }

  protected useInrHint(): void {
    const inr = this.inrHint();
    if (inr !== null) this.dialog.set('amountInr', String(inr));
  }

  protected save(): void {
    void this.dialog.submit(validateDividendForm, (value, id) =>
      this.dividends.save(value, id ?? undefined),
    );
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.dividends.remove(id));
  }
}
