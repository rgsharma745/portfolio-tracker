import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { localIsoDate } from '../../core/calc/common';
import { FD_SOON_DAYS, FdView, fdTotals, fdView } from '../../core/calc/fd';
import { FdService, FixedDeposit } from '../../core/data/fd.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { formatDate } from '../../shared/format/number';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { DateInput } from '../../shared/ui/date-input';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import {
  COMPOUNDING_OPTIONS,
  FD_BANK_MAX,
  FdForm,
  compoundingLabel,
  durationText,
  emptyFdForm,
  fdFormFrom,
  fdPreview,
  validateFdForm,
} from './fd-form';

export interface FdCard {
  fd: FixedDeposit;
  view: FdView;
  portfolio: string;
  startLabel: string;
  maturityLabel: string;
  rateText: string;
  /** "183 days left", "Matures today", "Matured 12 Oct 2026". */
  daysText: string;
  /** "About 6 months", shown under the days for terms of 60 days or more. */
  daysHint: string;
}

/** "7.25%": up to 3 decimals, no sign. */
export function rateText(rate: number): string {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(rate)}%`;
}

function daysText(view: FdView, maturityLabel: string): string {
  if (!view.matured) return `${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left`;
  return `Matured ${maturityLabel}`;
}

/** Fixed deposits: totals, one card per FD with maturity amount and days left, add/edit/delete. */
@Component({
  selector: 'app-fd-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    DateInput,
    EditDialog,
    EmptyState,
    ErrorState,
    ListSkeleton,
    MoneyPipe,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fd-page.html',
  styleUrl: './fd-page.scss',
})
export class FdPage {
  protected readonly fds = inject(FdService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly bankMax = FD_BANK_MAX;
  protected readonly soonDays = FD_SOON_DAYS;
  protected readonly compoundingOptions = COMPOUNDING_OPTIONS;
  protected readonly compoundingLabel = compoundingLabel;
  private readonly today = localIsoDate();

  protected readonly dialog = new DialogForm<FdForm>();

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly names = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );

  protected readonly totals = computed(() =>
    fdTotals(this.fds.deposits(), this.portfolios.scopeIds(), this.today),
  );

  private readonly cards = computed<FdCard[]>(() => {
    const ids = new Set(this.portfolios.scopeIds());
    return this.fds
      .deposits()
      .filter((fd) => ids.has(fd.portfolio_id))
      .map((fd) => {
        const view = fdView(fd, this.today);
        const maturityLabel = formatDate(fd.maturity_date);
        return {
          fd,
          view,
          portfolio: this.names().get(fd.portfolio_id) ?? '',
          startLabel: formatDate(fd.start_date),
          maturityLabel,
          rateText: rateText(fd.rate),
          daysText: daysText(view, maturityLabel),
          daysHint:
            !view.matured && view.daysLeft >= 60 ? `About ${durationText(view.daysLeft)}` : '',
        };
      });
  });
  /** Soonest maturity first. */
  protected readonly active = computed(() =>
    this.cards()
      .filter((c) => !c.view.matured)
      .sort((a, b) => a.fd.maturity_date.localeCompare(b.fd.maturity_date)),
  );
  /** Most recently matured first. */
  protected readonly matured = computed(() =>
    this.cards()
      .filter((c) => c.view.matured)
      .sort((a, b) => b.fd.maturity_date.localeCompare(a.fd.maturity_date)),
  );
  protected readonly next = computed(() => this.active()[0] ?? null);
  protected readonly nextNote = computed(() => {
    const n = this.next();
    if (!n) return this.matured().length ? 'Every FD has matured' : '';
    return `${n.fd.bank} · ${n.daysText}`;
  });

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  /** "Matures with ₹1,07,186 (₹7,186 interest) after 1 year" under the form. */
  /** Only while the dialog is open: before its first opening the form is empty. */
  protected readonly preview = computed(() =>
    this.dialog.open() ? fdPreview(this.dialog.form(), this.today) : null,
  );
  protected readonly termHint = computed(() => {
    const p = this.preview();
    return p ? `Term: ${durationText(p.days)} (${p.days} days).` : '';
  });

  protected cardLabel(card: FdCard): string {
    return this.showPortfolio() ? `${card.fd.bank} (${card.portfolio})` : card.fd.bank;
  }

  protected add(): void {
    this.dialog.show(
      emptyFdForm(this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? '', this.today),
    );
  }

  protected edit(fd: FixedDeposit): void {
    this.dialog.show(fdFormFrom(fd), fd.id);
  }

  protected save(): void {
    void this.dialog.submit(validateFdForm, (value, id) => this.fds.save(value, id ?? undefined));
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.fds.remove(id));
  }
}
