import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { savingsSummary } from '../../core/calc/savings';
import { HoldingsService, SavingsAccount } from '../../core/data/holdings.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { numberInputText, parseDecimal } from '../../shared/format/number';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { StatCard } from '../../shared/ui/stat-card';
import {
  BANK_NAME_MAX,
  SavingsForm,
  balanceError,
  emptySavingsForm,
  savingsFormFrom,
  validateSavingsForm,
} from './savings-form';

interface SavingsRow {
  account: SavingsAccount;
  portfolio: string;
  share: number;
}

/** Savings: total, accounts by balance with their share, inline balance edit, add/delete. */
@Component({
  selector: 'app-savings-page',
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    EditDialog,
    EmptyState,
    ErrorState,
    ListSkeleton,
    MoneyPipe,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './savings-page.html',
  styleUrl: './savings-page.scss',
})
export class SavingsPage {
  protected readonly holdings = inject(HoldingsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly bankMax = BANK_NAME_MAX;

  protected readonly dialog = new DialogForm<SavingsForm>();
  /** Desktop inline balance edit. */
  protected readonly inlineId = signal<string | null>(null);
  protected readonly inlineText = signal('');
  protected readonly inlineError = signal<string | null>(null);
  protected readonly inlineBusy = signal(false);

  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly summary = computed(() =>
    savingsSummary(this.holdings.savings(), this.portfolios.scopeIds()),
  );
  protected readonly total = computed(() => this.summary().total);
  protected readonly rows = computed<SavingsRow[]>(() => {
    const names = new Map(this.portfolios.portfolios().map((p) => [p.id, p.name]));
    const share = new Map(this.summary().accounts.map((a) => [a.id, a.share]));
    const ids = new Set(this.portfolios.scopeIds());
    return this.holdings
      .savings()
      .filter((a) => ids.has(a.portfolio_id))
      .sort((a, b) => b.balance - a.balance)
      .map((account) => ({
        account,
        portfolio: names.get(account.portfolio_id) ?? '',
        share: share.get(account.id) ?? 0,
      }));
  });
  protected readonly largest = computed(() => this.rows()[0]?.account ?? null);

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected shareText(share: number): string {
    return `${share.toFixed(share < 10 && share > 0 ? 1 : 0)}%`;
  }

  protected add(): void {
    this.dialog.show(
      emptySavingsForm(this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? ''),
    );
  }

  protected edit(account: SavingsAccount): void {
    this.inlineId.set(null);
    this.dialog.show(savingsFormFrom(account), account.id);
  }

  /** Tap a balance: inline on tablet/desktop, the dialog on mobile. */
  protected editBalance(account: SavingsAccount): void {
    if (this.bp.isMobile()) {
      this.edit(account);
      return;
    }
    this.inlineId.set(account.id);
    this.inlineText.set(numberInputText(account.balance));
    this.inlineError.set(null);
  }

  protected async saveInline(account: SavingsAccount): Promise<void> {
    const balance = parseDecimal(this.inlineText());
    const invalid = balanceError(balance);
    if (invalid) {
      this.inlineError.set(invalid);
      return;
    }
    this.inlineBusy.set(true);
    const error = await this.holdings.saveSavings(
      { portfolio_id: account.portfolio_id, bank: account.bank, balance: balance as number },
      account.id,
    );
    this.inlineBusy.set(false);
    this.inlineError.set(error);
    if (!error) this.inlineId.set(null);
  }

  protected save(): void {
    void this.dialog.submit(validateSavingsForm, (value, id) =>
      this.holdings.saveSavings(value, id ?? undefined),
    );
  }

  protected remove(): void {
    const id = this.dialog.editingId();
    if (id) void this.dialog.run(() => this.holdings.remove('savings_accounts', id));
  }
}
