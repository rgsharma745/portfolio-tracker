import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { fyLabel, fyStart, localIsoDate } from '../../core/calc/common';
import { navQuotes } from '../../core/calc/mf';
import {
  NPS_SCHEME_CLASSES,
  NpsAccountSummary,
  NpsContributor,
  NpsSchemeClass,
  NpsYearRow,
  isNpsSchemeClass,
  npsAccountKey,
  npsByAccount,
  npsByFinancialYear,
  npsMixIn,
  npsThisYear,
  npsTotals,
  valueNpsHolding,
} from '../../core/calc/nps';
import { NpsContribution, NpsHolding, NpsService } from '../../core/data/nps.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { formatMoney, formatPercent } from '../../shared/format/money';
import { formatDate, formatUnits } from '../../shared/format/number';
import { Sort, sortRows } from '../../shared/format/sort';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { AllocationBar, AllocationSlice } from '../../shared/ui/allocation-bar';
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
import { PlColorDirective } from '../../shared/ui/pl-color.directive';
import { StatCard } from '../../shared/ui/stat-card';
import {
  ACCOUNT_NAME_MAX,
  ContributionForm,
  SCHEME_NAME_MAX,
  SchemeForm,
  UnitsErrors,
  UnitsForm,
  contributionFormFrom,
  emptyContributionForm,
  emptySchemeForm,
  schemeClassLabel,
  schemeFormFrom,
  unitsFormFrom,
  validateContributionForm,
  validateSchemeForm,
  validateUnitsForm,
} from './nps-form';
import { SuggestInput } from '../../shared/ui/suggest-input';

export interface SchemeRow {
  id: string;
  holding: NpsHolding;
  name: string;
  schemeClass: string;
  account: string;
  portfolio: string;
  units: number;
  nav: number | null;
  navDate: string | null;
  stale: boolean;
  value: number | null;
  dayChange: number | null;
}

export interface ContributionRow {
  id: string;
  contribution: NpsContribution;
  /** `YYYY-MM-DD`, also the default sort key. */
  date: string;
  dateLabel: string;
  account: string;
  accountKey: string;
  portfolio: string;
  contributor: NpsContributor;
  fy: number;
  amount: number;
}

export interface AccountView extends NpsAccountSummary {
  portfolio: string;
  slices: AllocationSlice[];
}

/** "+12.34%" (a yearly rate), or a dash when there is no XIRR. */
export function xirrText(rate: number | null): string {
  return rate === null ? '—' : formatPercent(rate * 100);
}

const ALL = '';
const CONTRIBUTOR_LABEL: Record<NpsContributor, string> = { self: 'Self', employer: 'Employer' };

/** National Pension System: value, XIRR, schemes, contributions per financial year. */
@Component({
  selector: 'app-nps-page',
  imports: [
    SuggestInput,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TagModule,
    AllocationBar,
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

    PlColorDirective,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nps-page.html',
  styleUrl: './nps-page.scss',
})
export class NpsPage {
  protected readonly nps = inject(NpsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly accountMax = ACCOUNT_NAME_MAX;
  protected readonly schemeNameMax = SCHEME_NAME_MAX;
  protected readonly classOrder = NPS_SCHEME_CLASSES;
  private readonly today = localIsoDate();

  protected readonly contributionDialog = new DialogForm<ContributionForm>();
  protected readonly schemeDialog = new DialogForm<SchemeForm>();
  protected readonly unitsDialog = new DialogForm<UnitsForm>();

  /** An account key, or ALL. Narrows the per-year table and the contributions. */
  protected readonly accountFilter = signal(ALL);
  protected readonly fyFilter = signal<number | null>(null);
  protected readonly contributorFilter = signal<NpsContributor | null>(null);
  protected readonly sort = signal<Sort>({ key: 'date', order: -1 });
  protected readonly schemeSort = signal<Sort>({ key: 'value', order: -1 });

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly names = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  private readonly navs = computed(() => navQuotes(this.nps.navs()));
  private readonly scopedHoldings = computed(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.nps.holdings().filter((h) => ids.has(h.portfolio_id));
  });
  private readonly scopedContributions = computed(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.nps.contributions().filter((c) => ids.has(c.portfolio_id));
  });
  protected readonly isEmpty = computed(
    () => this.scopedHoldings().length === 0 && this.scopedContributions().length === 0,
  );

  protected readonly totals = computed(() =>
    npsTotals(
      this.nps.holdings(),
      this.nps.contributions(),
      this.navs(),
      this.portfolios.scopeIds(),
      this.today,
    ),
  );
  protected readonly thisYear = computed(() =>
    npsThisYear(this.nps.contributions(), this.portfolios.scopeIds(), this.today),
  );
  protected readonly thisYearLabel = fyLabel(fyStart(this.today));
  protected readonly investedNote = computed(
    () =>
      `Self ${formatMoney(this.totals().self)} · Employer ${formatMoney(this.totals().employer)}`,
  );
  protected readonly xirrLabel = computed(() => xirrText(this.totals().xirr));
  protected readonly xirrNote = computed(() =>
    this.totals().unpriced > 0
      ? 'Needs a NAV for every scheme'
      : this.totals().xirr === null
        ? 'Needs contributions and units'
        : 'A year: contributions in, value out today',
  );
  /** The newest NAV date across held schemes, for the value card. */
  protected readonly navNote = computed(() => {
    const unpriced = this.totals().unpriced;
    if (unpriced) return `${unpriced} ${unpriced === 1 ? 'scheme has' : 'schemes have'} no NAV`;
    // ISO dates compare as strings.
    const newest = this.schemes().reduce<string>(
      (max, s) => (s.navDate && s.navDate > max ? s.navDate : max),
      '',
    );
    return newest ? `NAV ${formatDate(newest)}` : '';
  });
  protected readonly mix = computed<AllocationSlice[]>(() =>
    npsMixIn(this.nps.holdings(), this.navs(), this.portfolios.scopeIds(), this.today).map((m) => ({
      key: m.schemeClass,
      label: `${m.schemeClass} · ${m.label}`,
      value: m.value,
      share: m.percent,
    })),
  );

  protected readonly accounts = computed<AccountView[]>(() =>
    npsByAccount(
      this.nps.holdings(),
      this.nps.contributions(),
      this.navs(),
      this.portfolios.scopeIds(),
      this.today,
    ).map((a) => ({
      ...a,
      portfolio: this.names().get(a.portfolioId) ?? '',
      slices: a.mix.map((m) => ({
        key: m.schemeClass,
        label: `${m.schemeClass} · ${m.label}`,
        value: m.value,
        share: m.percent,
      })),
    })),
  );
  /** The selected account, if it is still in scope (switching portfolio can drop it). */
  private readonly selectedAccount = computed(() => {
    const key = this.accountFilter();
    return this.accounts().some((a) => a.key === key) ? key : null;
  });

  protected readonly schemes = computed<SchemeRow[]>(() =>
    this.scopedHoldings().map((h) => {
      const v = valueNpsHolding(h, this.navs(), this.today);
      return {
        id: h.id,
        holding: h,
        name: h.scheme_name,
        schemeClass: h.scheme_class,
        account: h.account,
        portfolio: this.names().get(h.portfolio_id) ?? '',
        units: h.units,
        nav: v.nav,
        navDate: v.navDate,
        stale: v.stale,
        value: v.value,
        dayChange: v.dayChange,
      };
    }),
  );
  protected readonly sortedSchemes = computed(() => sortRows(this.schemes(), this.schemeSort()));
  protected readonly schemeFooter = computed(() => ({
    value: this.totals().value,
    dayChange: this.totals().dayChange,
  }));

  protected readonly years = computed(() =>
    npsByFinancialYear(
      this.nps.contributions(),
      this.portfolios.scopeIds(),
      this.selectedAccount(),
    ),
  );
  protected readonly yearTotals = computed(() =>
    this.years().reduce(
      (t, y) => ({
        self: t.self + y.self,
        employer: t.employer + y.employer,
        total: t.total + y.total,
      }),
      { self: 0, employer: 0, total: 0 },
    ),
  );

  protected readonly rows = computed<ContributionRow[]>(() =>
    this.scopedContributions().map((c) => ({
      id: c.id,
      contribution: c,
      date: c.contribution_date,
      dateLabel: formatDate(c.contribution_date),
      account: c.account,
      accountKey: npsAccountKey(c),
      portfolio: this.names().get(c.portfolio_id) ?? '',
      contributor: c.contributor === 'employer' ? 'employer' : 'self',
      fy: fyStart(c.contribution_date),
      amount: c.amount,
    })),
  );
  protected readonly visible = computed(() => {
    const account = this.selectedAccount();
    return sortRows(
      this.rows().filter(
        (r) =>
          (account === null || r.accountKey === account) &&
          (this.fyFilter() === null || r.fy === this.fyFilter()) &&
          (this.contributorFilter() === null || r.contributor === this.contributorFilter()),
      ),
      this.sort(),
    );
  });
  protected readonly footer = computed(() => ({
    amount: this.visible().reduce((s, r) => s + r.amount, 0),
  }));

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
  protected readonly contributorOptions = [
    { label: 'Self and employer', value: null },
    { label: 'Self', value: 'self' },
    { label: 'Employer', value: 'employer' },
  ];
  protected readonly contributorChoices = [
    { label: 'Self', value: 'self' },
    { label: 'Employer', value: 'employer' },
  ];
  protected readonly classOptions = NPS_SCHEME_CLASSES.map((c) => ({
    label: schemeClassLabel(c),
    value: c,
  }));
  /** Account names already used, offered as suggestions in the dialogs. */
  protected readonly knownAccounts = computed(() =>
    [
      ...new Set([
        ...this.nps.holdings().map((h) => h.account),
        ...this.nps.contributions().map((c) => c.account),
      ]),
    ].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected readonly schemeColumns: Column<SchemeRow>[] = [
    { key: 'name', header: 'Scheme', type: 'custom', sortable: true },
    { key: 'units', header: 'Units', type: 'units' },
    { key: 'nav', header: 'NAV', type: 'custom', sortable: true, alignEnd: true },
    { key: 'value', header: 'Value', type: 'money' },
    { key: 'dayChange', header: '1 Day Change', type: 'pl' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];
  protected readonly yearColumns: Column<NpsYearRow>[] = [
    { key: 'label', header: 'Financial year', type: 'custom', sortable: false },
    { key: 'self', header: 'Self', type: 'money', sortable: false },
    { key: 'employer', header: 'Employer', type: 'money', sortable: false },
    { key: 'total', header: 'Total', type: 'money', sortable: false },
    { key: 'cumulative', header: 'Contributed to date', type: 'money', sortable: false },
  ];
  protected readonly columns: Column<ContributionRow>[] = [
    { key: 'date', header: 'Date', type: 'custom', sortable: true },
    { key: 'account', header: 'Account', type: 'custom', sortable: true },
    { key: 'contributor', header: 'By', type: 'custom', sortable: true },
    { key: 'amount', header: 'Amount', type: 'money' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected readonly contributionTitle = computed(() => {
    if (this.contributionDialog.isEdit()) return 'Edit contribution';
    return this.contributionDialog.form().contributor === 'employer'
      ? 'Add employer contribution'
      : 'Add contribution';
  });
  /** "Counts for FY 2025–26" under the date. */
  protected readonly dateHint = computed(() => {
    const date = this.contributionDialog.form().date;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `Counts for ${fyLabel(fyStart(date))}.` : '';
  });
  protected readonly unitsErrors = computed(() => this.unitsDialog.errors() as UnitsErrors);

  private defaultPortfolio(): string {
    return this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '';
  }

  private onlyAccount(): AccountView | null {
    return this.accounts().length === 1 ? this.accounts()[0] : null;
  }

  protected contributorName(c: string): string {
    return CONTRIBUTOR_LABEL[c === 'employer' ? 'employer' : 'self'];
  }

  protected xirr(rate: number | null): string {
    return xirrText(rate);
  }

  protected classLabel(c: string): string {
    return isNpsSchemeClass(c) ? `Scheme ${c}` : c;
  }

  protected staleTitle(row: SchemeRow): string {
    return `NAV from ${formatDate(row.navDate)}: older than 4 days`;
  }

  protected units(value: number | null): string {
    return formatUnits(value);
  }

  protected date(iso: string | null): string {
    return formatDate(iso);
  }

  protected holdingsOf(a: AccountView): NpsHolding[] {
    return this.nps.holdings().filter((h) => npsAccountKey(h) === a.key);
  }

  // ---- Contributions ----

  protected addContribution(contributor: NpsContributor = 'self'): void {
    const only = this.onlyAccount();
    this.contributionDialog.show(
      emptyContributionForm(
        only?.portfolioId ?? this.defaultPortfolio(),
        only?.account ?? '',
        this.today,
        contributor,
      ),
    );
  }

  protected addContributionFor(a: AccountView): void {
    this.contributionDialog.show(emptyContributionForm(a.portfolioId, a.account, this.today));
  }

  protected editContribution(row: ContributionRow): void {
    this.contributionDialog.show(contributionFormFrom(row.contribution), row.id);
  }

  protected saveContribution(): void {
    void this.contributionDialog.submit(validateContributionForm, (value, id) =>
      this.nps.saveContribution(value, id ?? undefined),
    );
  }

  protected removeContribution(): void {
    const id = this.contributionDialog.editingId();
    if (id) void this.contributionDialog.run(() => this.nps.removeContribution(id));
  }

  // ---- Schemes ----

  /** A new scheme row, for the first class the account does not hold yet. */
  protected addScheme(a: AccountView | null = this.onlyAccount()): void {
    const held = new Set(a ? this.holdingsOf(a).map((h) => h.scheme_class) : []);
    const next: NpsSchemeClass = NPS_SCHEME_CLASSES.find((c) => !held.has(c)) ?? 'E';
    this.schemeDialog.show(
      emptySchemeForm(
        a?.portfolioId ?? this.defaultPortfolio(),
        a?.account ?? '',
        next,
        this.today,
      ),
    );
  }

  protected editScheme(row: SchemeRow): void {
    this.schemeDialog.show(schemeFormFrom(row.holding), row.id);
  }

  protected saveScheme(): void {
    void this.schemeDialog.submit(validateSchemeForm, (value, id) =>
      this.nps.saveHolding(value, id ?? undefined),
    );
  }

  protected removeScheme(): void {
    const id = this.schemeDialog.editingId();
    if (id) void this.schemeDialog.run(() => this.nps.removeHolding(id));
  }

  // ---- Update units ----

  protected updateUnits(a: AccountView): void {
    this.unitsDialog.show(unitsFormFrom(this.holdingsOf(a), this.today));
  }

  protected setLineUnits(id: string, units: string): void {
    this.unitsDialog.form.update((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.id === id ? { ...l, units } : l)),
    }));
  }

  protected saveUnits(): void {
    void this.unitsDialog.submit(validateUnitsForm, (value) =>
      this.nps.updateUnits(value.updates, value.asOf),
    );
  }

  protected clearFilters(): void {
    this.accountFilter.set(ALL);
    this.fyFilter.set(null);
    this.contributorFilter.set(null);
  }
}
