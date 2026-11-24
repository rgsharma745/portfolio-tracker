import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SelectButtonModule } from 'primeng/selectbutton';
import { localIsoDate } from '../../core/calc/common';
import { cardDues } from '../../core/calc/cards';
import { fdValue } from '../../core/calc/fd';
import { mfTotals, navQuotes } from '../../core/calc/mf';
import { npsTotals } from '../../core/calc/nps';
import { pfBalance } from '../../core/calc/pf';
import { ppfBalance } from '../../core/calc/ppf';
import { equityValue } from '../../core/calc/equity';
import { savingsTotal } from '../../core/calc/savings';
import { stockTotals } from '../../core/calc/stocks';
import { CardsService } from '../../core/data/cards.service';
import { EquityService } from '../../core/data/equity.service';
import { FdService } from '../../core/data/fd.service';
import { HoldingsService } from '../../core/data/holdings.service';
import { NpsService } from '../../core/data/nps.service';
import { PfService } from '../../core/data/pf.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { PpfService } from '../../core/data/ppf.service';
import { SnapshotsService } from '../../core/data/snapshots.service';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { AllocationBar } from '../../shared/ui/allocation-bar';
import { CardTemplate, Column, DataTable } from '../../shared/ui/data-table';
import { ErrorState } from '../../shared/ui/error-state';
import { LineChart } from '../../shared/ui/line-chart';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe, PercentPipe } from '../../shared/ui/money.pipe';
import { PlColorDirective } from '../../shared/ui/pl-color.directive';
import {
  HistoryRange,
  HistorySeries,
  PortfolioSummaryRow,
  allocation,
  historySeries,
  summaryRow,
  totalRow,
} from './overview-calc';

interface BalanceRow {
  label: string;
  value: number | null;
  dayChange?: number;
  warning?: boolean;
}

const ALLOCATION_ORDER = ['mf', 'stocks', 'equity', 'savings', 'pf', 'ppf', 'nps', 'fd'];

/** Overview: headline totals, allocation, history and a per-portfolio summary. */
@Component({
  selector: 'app-overview-page',
  imports: [
    FormsModule,
    RouterLink,
    SelectButtonModule,
    AllocationBar,
    CardTemplate,
    DataTable,
    ErrorState,
    LineChart,
    ListSkeleton,
    MoneyPipe,
    PercentPipe,
    PlColorDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.scss',
})
export class OverviewPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly cards = inject(CardsService);
  protected readonly pf = inject(PfService);
  protected readonly ppf = inject(PpfService);
  protected readonly nps = inject(NpsService);
  protected readonly equity = inject(EquityService);
  protected readonly fd = inject(FdService);
  protected readonly snapshots = inject(SnapshotsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  private readonly today = localIsoDate();

  protected readonly loaded = computed(
    () =>
      this.holdings.loaded() &&
      this.cards.loaded() &&
      this.pf.loaded() &&
      this.ppf.loaded() &&
      this.nps.loaded() &&
      this.fd.loaded() &&
      this.equity.lotsLoaded(),
  );
  protected readonly error = computed(
    () =>
      this.holdings.error() ??
      this.cards.error() ??
      this.pf.error() ??
      this.ppf.error() ??
      this.nps.error() ??
      this.fd.error() ??
      this.equity.lotsError(),
  );
  protected readonly range = signal<HistoryRange>('6M');
  protected readonly ranges: HistoryRange[] = ['1M', '6M', '1Y', 'All'];
  protected readonly series = signal<HistorySeries>('mf');
  protected readonly seriesOptions = [
    { label: 'Mutual funds', value: 'mf' },
    { label: 'Stocks', value: 'stocks' },
    { label: 'Employee equity', value: 'equity' },
    { label: 'PF', value: 'pf' },
    { label: 'PPF', value: 'ppf' },
    { label: 'NPS', value: 'nps' },
    { label: 'FD', value: 'fd' },
  ];
  protected readonly historyTitles: Record<HistorySeries, string> = {
    mf: 'Mutual funds',
    stocks: 'Stocks',
    equity: 'Employee equity',
    pf: 'PF balance',
    ppf: 'PPF balance',
    nps: 'NPS value',
    fd: 'FD value',
  };
  protected readonly allocationOrder = ALLOCATION_ORDER;

  private readonly ids = computed(() => this.portfolios.scopeIds());
  protected readonly mf = computed(() =>
    mfTotals(this.holdings.mf(), this.holdings.navQuotes(), this.ids(), this.today),
  );
  protected readonly stocks = computed(() =>
    stockTotals(
      this.holdings.stocks(),
      this.holdings.priceQuotes(),
      this.holdings.usdInr(),
      this.ids(),
      this.today,
    ),
  );
  protected readonly equityTotal = computed(() => equityValue(this.equity.lots(), this.ids()));
  protected readonly savings = computed(() => savingsTotal(this.holdings.savings(), this.ids()));
  protected readonly dues = computed(() => cardDues(this.cards.bills(), this.ids()));
  protected readonly pfTotal = computed(() => pfBalance(this.pf.entries(), this.ids()));
  protected readonly ppfTotal = computed(() => ppfBalance(this.ppf.entries(), this.ids()));
  protected readonly npsTotal = computed(() =>
    npsTotals(
      this.nps.holdings(),
      this.nps.contributions(),
      navQuotes(this.nps.navs()),
      this.ids(),
      this.today,
    ),
  );
  protected readonly fdTotal = computed(() => fdValue(this.fd.deposits(), this.ids(), this.today));
  protected readonly balanceGroups = computed<
    readonly { title: string; icon: string; rows: readonly BalanceRow[] }[]
  >(() => [
    {
      title: 'Investments',
      icon: 'pi-chart-line',
      rows: [
        { label: 'Mutual funds', value: this.mf().value, dayChange: this.mf().dayChange },
        { label: 'Stocks', value: this.stocks().value, dayChange: this.stocks().dayChange },
        {
          label: 'Employee equity',
          value:
            this.equityTotal().unpriced && !this.equityTotal().priced
              ? null
              : this.equityTotal().value,
        },
        { label: 'NPS', value: this.npsTotal().value, dayChange: this.npsTotal().dayChange },
      ],
    },
    {
      title: 'Savings and dues',
      icon: 'pi-wallet',
      rows: [
        { label: 'Savings', value: this.savings() },
        { label: 'PF', value: this.pfTotal() },
        { label: 'PPF', value: this.ppfTotal() },
        { label: 'Fixed deposits', value: this.fdTotal() },
        { label: 'Card dues', value: this.dues(), warning: this.dues() > 0 },
      ],
    },
  ]);
  protected readonly unpriced = computed(
    () =>
      this.mf().unpriced +
      this.stocks().unpriced +
      this.npsTotal().unpriced +
      this.equityTotal().unpriced,
  );

  protected readonly allocation = computed(() =>
    allocation([
      { key: 'mf', label: 'Mutual funds', value: this.mf().value },
      { key: 'stocks', label: 'Stocks', value: this.stocks().value },
      { key: 'equity', label: 'Employee equity', value: this.equityTotal().value },
      { key: 'savings', label: 'Savings', value: this.savings() },
      { key: 'pf', label: 'PF', value: this.pfTotal() },
      { key: 'ppf', label: 'PPF', value: this.ppfTotal() },
      { key: 'nps', label: 'NPS', value: this.npsTotal().value },
      { key: 'fd', label: 'Fixed deposits', value: this.fdTotal() },
    ]),
  );

  protected readonly history = computed(() =>
    historySeries(this.snapshots.snapshots(), this.ids(), this.range(), this.today, this.series()),
  );

  /** One row per portfolio in scope, and a family total when there are several. */
  protected readonly summaryRows = computed(() => {
    const h = this.holdings;
    return this.portfolios
      .active()
      .filter((p) => this.ids().includes(p.id))
      .map((p) =>
        summaryRow(
          p.id,
          p.name,
          mfTotals(h.mf(), h.navQuotes(), [p.id], this.today),
          stockTotals(h.stocks(), h.priceQuotes(), h.usdInr(), [p.id], this.today),
          equityValue(this.equity.lots(), [p.id]),
        ),
      );
  });
  protected readonly summaryFooter = computed(() => {
    const rows = this.summaryRows();
    if (rows.length < 2) return null;
    const { name, holdings, invested, value, pl, plPercent, dayChange } = totalRow(rows);
    return { name, holdings, invested, value, pl, plPercent, dayChange };
  });
  protected readonly familyTotal = computed(() => totalRow(this.summaryRows()));

  protected readonly summaryColumns: Column<PortfolioSummaryRow>[] = [
    { key: 'name', header: 'Portfolio', sortable: false },
    { key: 'holdings', header: 'Holdings', type: 'units', sortable: false },
    { key: 'invested', header: 'Invested', type: 'money', sortable: false },
    { key: 'value', header: 'Current', type: 'money', sortable: false },
    { key: 'pl', header: 'P&L', type: 'pl', sortable: false },
    { key: 'plPercent', header: 'P&L %', type: 'percent', sortable: false },
    { key: 'dayChange', header: '1 Day Change', type: 'pl', sortable: false },
  ];

  protected retry(): void {
    void this.holdings.load();
    void this.equity.loadLots();
    void this.cards.load();
    void this.pf.load();
    void this.ppf.load();
    void this.nps.load();
    void this.fd.load();
  }
}
