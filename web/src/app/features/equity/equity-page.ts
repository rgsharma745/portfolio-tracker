import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { equityTotals } from '../../core/calc/equity';
import { localIsoDate } from '../../core/calc/common';
import { EquityService } from '../../core/data/equity.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { RefreshService } from '../../core/data/refresh.service';
import { formatDate, formatUnits } from '../../shared/format/number';
import { Sort, sortRows } from '../../shared/format/sort';
import { CardTemplate, CellTemplate, Column, DataTable } from '../../shared/ui/data-table';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import { EquityEditor } from './equity-editor';
import { Draft, DraftKind, editDraft, newDraft } from './equity-form';
import {
  EquityRow,
  companyLabel,
  companyRow,
  eventRow,
  grantRow,
  saleRow,
  scheduleRow,
} from './equity-rows';

const views = ['Grants', 'Vesting', 'Exercises', 'Sales', 'Companies'] as const;
type View = (typeof views)[number];

@Component({
  selector: 'app-equity-page',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    ButtonModule,
    CardTemplate,
    CellTemplate,
    DataTable,
    EmptyState,
    ErrorState,
    ListSkeleton,
    MoneyPipe,
    StatCard,
    EquityEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equity-page.html',
  styleUrl: './equity-page.scss',
})
export class EquityPage {
  protected readonly equity = inject(EquityService);
  private readonly portfolios = inject(PortfolioService);
  private readonly refresh = inject(RefreshService);
  private readonly today = localIsoDate();
  protected readonly views = views;
  protected readonly view = signal<View>('Grants');
  protected readonly company = signal('');
  protected readonly grantType = signal('');
  protected readonly grantId = signal('');
  protected readonly sort = signal<Sort>({ key: 'date', order: -1 });
  protected readonly draft = signal<Draft | null>(null);

  private readonly ledger = this.equity.ledger;
  protected readonly companies = computed(() =>
    [...this.ledger().securities].sort((a, b) => a.name.localeCompare(b.name)),
  );
  private readonly companyNames = computed(
    () => new Map(this.companies().map((security) => [security.id, companyLabel(security)])),
  );
  private readonly portfolioNames = computed(
    () => new Map(this.portfolios.active().map((p) => [p.id, p.name])),
  );
  protected readonly grantOptions = computed(() => {
    const scope = new Set(this.portfolios.scopeIds());
    return this.ledger().grants.filter(
      (g) =>
        scope.has(g.portfolio_id) &&
        (!this.company() || g.security_id === this.company()) &&
        (!this.grantType() || g.kind === this.grantType()),
    );
  });
  private readonly grants = computed(() =>
    this.grantOptions().filter((g) => !this.grantId() || g.id === this.grantId()),
  );
  private readonly grantNames = computed(() => new Map(this.grants().map((g) => [g.id, g.label])));
  private readonly scope = computed(() => {
    const ledger = this.ledger();
    const ids = this.grantNames();
    return {
      schedule: ledger.schedule.filter((a) => ids.has(a.grant_id)),
      events: ledger.events.filter((a) => ids.has(a.grant_id)),
      lots: ledger.lots.filter((a) => ids.has(a.grant_id)),
      sales: ledger.saleDetails.filter((a) => a.grant_id && ids.has(a.grant_id)),
    };
  });
  protected readonly totals = computed(() => {
    const s = this.scope();
    return equityTotals(this.grants(), s.events, s.lots, s.sales);
  });
  private readonly schedule = computed(() => {
    const s = this.scope();
    const grants = new Map(this.grants().map((g) => [g.id, g]));
    return s.schedule.map((tranche) =>
      scheduleRow(
        tranche,
        this.grantNames().get(tranche.grant_id) ?? '',
        this.subtitle(grants.get(tranche.grant_id)),
        s.events,
        this.today,
      ),
    );
  });
  protected readonly upcoming = computed(() =>
    sortRows(
      this.schedule().filter((s) => s.status !== 'Completed'),
      { key: 'date', order: 1 },
    ),
  );
  protected readonly rows = computed(() => sortRows(this.buildRows(this.view()), this.sort()));
  protected readonly columns = computed<Column<EquityRow>[]>(() => [
    {
      key: 'name',
      header: this.view() === 'Companies' || this.view() === 'Sales' ? 'Company' : 'Grant',
      type: 'custom',
      sortable: true,
    },
    { key: 'date', header: this.view() === 'Companies' ? 'Valuation date' : 'Date', type: 'date' },
    ...(this.view() === 'Companies'
      ? []
      : [
          { key: 'quantity', header: 'Quantity', type: 'units' } as const,
          {
            key: 'value',
            header: this.view() === 'Sales' ? 'Realized P&L' : 'Current value',
            type: 'money',
          } as const,
        ]),
    { key: 'status', header: 'Status' },
    { key: 'details', header: 'Details', type: 'custom' },
  ]);

  protected readonly footer = computed(() => {
    if (this.view() !== 'Sales') return null;
    return { name: 'Total', quantity: this.totals().sold, value: this.totals().realized };
  });
  protected readonly realizedEstimated = computed(() =>
    this.scope().sales.some((sale) => !sale.bank_on),
  );

  constructor() {
    effect(() => {
      this.refresh.tick();
      void this.refresh.track(this.equity.load());
    });
    effect(() => {
      const selection = this.grantId();
      if (selection && !this.grantOptions().some((g) => g.id === selection)) this.grantId.set('');
    });
  }

  protected changeView(view: View): void {
    this.view.set(view);
    this.sort.set({ key: 'date', order: view === 'Vesting' ? 1 : -1 });
  }

  protected add(kind: DraftKind): void {
    const grant = this.grantOptions().find((g) => g.id === this.grantId());
    const portfolio =
      this.portfolios.scope() ?? grant?.portfolio_id ?? this.portfolios.active()[0]?.id ?? '';
    const security = this.companies().find((s) => s.id === (grant?.security_id ?? this.company()));
    this.draft.set(
      newDraft(kind, {
        date: kind === 'company' ? '' : this.today,
        market: 'US',
        currency: security?.currency ?? 'USD',
        portfolio,
        grant: grant && (kind !== 'exercise' || grant.kind === 'ESOP') ? grant.id : '',
        security: security?.id ?? '',
        award: this.grantType() || 'RSU',
        price: kind === 'exercise' ? String(grant?.grant_price ?? '') : '',
      }),
    );
  }

  protected edit(row: EquityRow): void {
    const details = this.ledger().saleDetails.filter((a) => a.sale_id === row.id);
    this.draft.set(editDraft(row.entity, details));
  }

  protected date = formatDate;
  protected units = (n: number | null) => formatUnits(n, 6);

  private buildRows(view: View): EquityRow[] {
    const s = this.scope();
    const grants = this.grants();
    if (view === 'Companies') {
      return this.companies()
        .filter((s) => !this.company() || s.id === this.company())
        .map(companyRow);
    }
    if (view === 'Sales') {
      return this.ledger().sales.flatMap((sale) => {
        const details = s.sales.filter((a) => a.sale_id === sale.id);
        return details.length
          ? [
              saleRow(
                sale,
                this.companyNames().get(sale.security_id) ?? '',
                this.portfolioNames().get(sale.portfolio_id) ?? '',
                details,
                this.grantNames(),
              ),
            ]
          : [];
      });
    }
    if (view === 'Grants') {
      return grants.map((g) =>
        grantRow(
          g,
          this.companyNames().get(g.security_id) ?? '',
          this.portfolioNames().get(g.portfolio_id) ?? '',
          s.events.filter((a) => a.grant_id === g.id),
          s.lots.filter((a) => a.grant_id === g.id),
          s.sales.filter((a) => a.grant_id === g.id),
          this.today,
        ),
      );
    }
    const byGrant = new Map(grants.map((g) => [g.id, g]));
    const events = s.events
      .filter((e) => e.kind === (view === 'Exercises' ? 'exercise' : 'vest'))
      .map((e) =>
        eventRow(
          e,
          this.grantNames().get(e.grant_id) ?? '',
          this.subtitle(byGrant.get(e.grant_id)),
          s.lots.find((lot) => lot.id === e.id),
          s.sales.filter((sale) => sale.event_id === e.id),
          this.today,
          this.companies().some(
            (security) =>
              security.id === byGrant.get(e.grant_id)?.security_id && security.market === 'PRIVATE',
          ),
        ),
      );
    return view === 'Vesting' ? [...this.schedule(), ...events] : events;
  }

  private subtitle(grant?: { security_id: string; portfolio_id: string; kind: string }) {
    if (!grant) return '';
    return [
      this.companyNames().get(grant.security_id),
      this.portfolioNames().get(grant.portfolio_id),
      grant.kind,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
