import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { localIsoDate, sumValuations } from '../../core/calc/common';
import { Market, stockTotals } from '../../core/calc/stocks';
import { HoldingsService } from '../../core/data/holdings.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { toCsv } from '../../shared/format/csv';
import { downloadText } from '../../shared/format/download';
import { Currency, formatMoney } from '../../shared/format/money';
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
import { StockForm, emptyStockForm, stockFormFrom, validateStockForm } from './stock-form';
import { STOCK_CSV_COLUMNS, StockRow, buildStockRows } from './stock-rows';

/** Stocks: India and US tabs, USD or INR for US, totals, list, add/edit/delete, CSV. */
@Component({
  selector: 'app-stocks-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TagModule,
    ToggleSwitchModule,
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
  templateUrl: './stocks-page.html',
  styleUrl: './stocks-page.scss',
})
export class StocksPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  private readonly today = localIsoDate();

  protected readonly market = signal<Market>('IN');
  /** US tab: show values in INR instead of USD. */
  protected readonly inInr = signal(false);
  protected readonly search = signal('');
  protected readonly plFilter = signal<PlFilter>('all');
  protected readonly sort = signal<Sort>({ key: 'value', order: -1 });
  protected readonly markets: { label: string; value: Market }[] = [
    { label: 'India', value: 'IN' },
    { label: 'US', value: 'US' },
  ];
  /** Market switch labels with the number of holdings in each. */
  protected readonly marketTabs = computed(() =>
    this.markets.map((m) => ({ ...m, label: `${m.label} (${this.counts()[m.value]})` })),
  );
  protected readonly sortOptions = [
    { label: 'Current value', value: 'value' },
    { label: 'Symbol', value: 'name' },
    { label: 'P&L', value: 'pl' },
    { label: 'P&L %', value: 'plPercent' },
    { label: 'Today', value: 'dayChange' },
  ];

  protected readonly dialog = new DialogForm<StockForm>();

  /** The currency totals and rows are shown in. */
  protected readonly currency = computed<Currency>(() =>
    this.market() === 'US' && !this.inInr() ? 'USD' : 'INR',
  );
  private readonly portfolioNames = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  protected readonly noRate = computed(
    () => this.market() === 'US' && this.holdings.usdInr() === null,
  );

  private readonly inScope = computed(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.holdings.stocks().filter((h) => ids.has(h.portfolio_id));
  });
  protected readonly hasAny = computed(() => this.inScope().length > 0);
  protected readonly counts = computed(() => ({
    IN: this.inScope().filter((h) => h.market === 'IN').length,
    US: this.inScope().filter((h) => h.market === 'US').length,
  }));

  protected readonly rows = computed(() =>
    buildStockRows(
      this.holdings.stocks(),
      this.holdings.priceQuotes(),
      this.holdings.usdInr(),
      this.portfolioNames(),
      this.portfolios.scopeIds(),
      this.today,
      this.market(),
      this.currency() === 'INR',
    ),
  );
  protected readonly totals = computed(() =>
    stockTotals(
      this.holdings.stocks(),
      this.holdings.priceQuotes(),
      this.holdings.usdInr(),
      this.portfolios.scopeIds(),
      this.today,
      { market: this.market(), currency: this.currency() },
    ),
  );
  protected readonly visible = computed(() =>
    sortRows(
      filterByPl(
        this.rows().filter((r) => matchesSearch(this.search(), r.symbol, r.companyName)),
        this.plFilter(),
      ),
      this.sort(),
    ),
  );
  protected readonly footer = computed(() => {
    const t = sumValuations(this.visible().map((r) => r.valuation));
    return {
      currency: this.currency(),
      invested: t.invested,
      value: t.value,
      pl: t.pl,
      plPercent: t.plPercent,
      dayChange: t.dayChange,
    };
  });

  private readonly rowCurrency = (row: StockRow) => row.currency;
  protected readonly columns: Column<StockRow>[] = [
    { key: 'name', header: 'Stock', type: 'custom', sortable: true },
    { key: 'value', header: 'Value', type: 'custom', sortable: true, alignEnd: true },
    { key: 'pl', header: 'P&L', type: 'custom', sortable: true, alignEnd: true },
    { key: 'dayChange', header: 'Today', type: 'pl', currency: this.rowCurrency },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected money(
    value: number | null,
    currency: Currency = this.currency(),
    digits?: number,
  ): string {
    return formatMoney(value, currency, digits === undefined ? {} : { digits });
  }

  protected signed(value: number | null, currency: Currency): string {
    return formatMoney(value, currency, { sign: true });
  }

  protected units(value: number): string {
    return formatUnits(value);
  }

  /** "3 Nov" (the year only when it is not this year). */
  protected shortDate(value: string | null): string {
    const text = formatDate(value);
    return value?.startsWith(this.today.slice(0, 4)) ? text.replace(/ \d{4}$/, '') : text;
  }

  protected meta(row: StockRow): string {
    const parts = [row.companyName ?? '', `${row.quantity} sh`];
    if (row.currency === 'USD' && row.valueInr !== null)
      parts.push(`≈ ${this.money(row.valueInr, 'INR')}`);
    return parts.filter(Boolean).join(' · ');
  }

  protected staleTitle(row: StockRow): string {
    return `Price from ${formatDate(row.priceDate)}: older than 4 days`;
  }

  protected setMarket(market: Market): void {
    this.market.set(market);
    this.search.set('');
  }

  protected add(): void {
    const portfolio = this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
    this.dialog.show(emptyStockForm(portfolio, this.market()));
  }

  protected edit(row: StockRow): void {
    this.dialog.show(stockFormFrom(row.holding), row.id);
  }

  protected save(): void {
    void this.dialog.submit(validateStockForm, (value, id) =>
      this.holdings.saveStock(value, id ?? undefined),
    );
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.holdings.remove('stock_holdings', id));
  }

  protected exportCsv(): void {
    downloadText(
      `stocks-${this.market().toLowerCase()}-${this.today}.csv`,
      toCsv(STOCK_CSV_COLUMNS, this.visible()),
      'text/csv;charset=utf-8',
    );
  }
}
