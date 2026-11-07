import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { rsuTotals } from '../../core/calc/rsu';
import { HoldingsService } from '../../core/data/holdings.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { formatMoney } from '../../shared/format/money';
import { formatDate, formatUnits } from '../../shared/format/number';
import { Sort, sortRows } from '../../shared/format/sort';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { CardTemplate, CellTemplate, Column, DataTable } from '../../shared/ui/data-table';
import { DialogForm } from '../../shared/ui/dialog-form';
import { DateInput } from '../../shared/ui/date-input';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import { RsuForm, emptyRsuForm, rsuFormFrom, validateRsuForm } from './rsu-form';
import { RsuRow, buildRsuRows, singlePrice } from './rsu-rows';

/** RSU grants: value cards (USD and INR), unit cards, grants list and grant editing. */
@Component({
  selector: 'app-rsu-page',
  imports: [
    DateInput,
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
    ListSkeleton,
    MoneyPipe,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rsu-page.html',
  styleUrl: './rsu-page.scss',
})
export class RsuPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);

  protected readonly dialog = new DialogForm<RsuForm>();
  /** Grants are listed oldest first. */
  private readonly sort: Sort = { key: 'grantDate', order: 1 };

  private readonly portfolioNames = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);

  protected readonly rows = computed(() =>
    sortRows(
      buildRsuRows(
        this.holdings.rsu(),
        this.holdings.priceQuotes(),
        this.holdings.usdInr(),
        this.portfolioNames(),
        this.portfolios.scopeIds(),
      ),
      this.sort,
    ),
  );
  protected readonly totals = computed(() =>
    rsuTotals(
      this.holdings.rsu(),
      this.holdings.priceQuotes(),
      this.holdings.usdInr(),
      this.portfolios.scopeIds(),
    ),
  );
  protected readonly price = computed(() => singlePrice(this.rows()));
  protected readonly footer = computed(() => {
    const t = this.totals();
    return {
      granted: t.units.granted,
      vested: t.units.vested,
      soldForTax: t.units.soldForTax,
      sellable: t.units.sellable,
      pending: t.units.pending,
      vestedInr: t.vestedInr ?? undefined,
      afterTaxInr: t.afterTaxInr ?? undefined,
    };
  });

  protected readonly columns: Column<RsuRow>[] = [
    { key: 'name', header: 'Grant', type: 'custom', sortable: false },
    { key: 'grantDate', header: 'Granted on', type: 'date', sortable: false },
    { key: 'granted', header: 'Granted', type: 'units', sortable: false },
    { key: 'vested', header: 'Vested', type: 'units', sortable: false },
    { key: 'soldForTax', header: 'Sold for tax', type: 'units', sortable: false },
    { key: 'sellable', header: 'Sellable', type: 'units', sortable: false },
    { key: 'pending', header: 'Pending', type: 'units', sortable: false },
    { key: 'taxPercent', header: 'Tax rate', type: 'custom', alignEnd: true },
    { key: 'vestedInr', header: 'Vested value', type: 'money', sortable: false },
    { key: 'afterTaxInr', header: 'After tax', type: 'money', sortable: false },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected units(value: number): string {
    return formatUnits(value);
  }

  protected usd(value: number | null): string {
    return formatMoney(value, 'USD');
  }

  protected date(value: string | null): string {
    return formatDate(value);
  }

  protected add(): void {
    const portfolio = this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
    this.dialog.show(emptyRsuForm(portfolio, this.rows()[0]?.symbol ?? ''));
  }

  protected edit(row: RsuRow): void {
    this.dialog.show(rsuFormFrom(row.grant), row.id);
  }

  protected save(): void {
    void this.dialog.submit(validateRsuForm, (value, id) =>
      this.holdings.saveRsu(value, id ?? undefined),
    );
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.holdings.remove('rsu_grants', id));
  }
}
