import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { localIsoDate } from '../../core/calc/common';
import { addMonths, cardsSummary, earlierUnsettled, monthStart } from '../../core/calc/cards';
import { CardBill, CardsService, CreditCard } from '../../core/data/cards.service';
import { PortfolioService } from '../../core/data/portfolio.service';
import { formatDate, formatMonth } from '../../shared/format/number';
import { BreakpointService } from '../../shared/layout/breakpoint.service';
import { DialogForm } from '../../shared/ui/dialog-form';
import { EditDialog } from '../../shared/ui/edit-dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';
import { StatCard } from '../../shared/ui/stat-card';
import { BillList } from './bill-list';
import { BillRow, buildBillRows, dueLabel } from './bill-rows';
import {
  BillForm,
  CARD_NAME_MAX,
  CardForm,
  NOTES_MAX,
  billFormFrom,
  cardFormFrom,
  emptyCardForm,
  validateBillForm,
  validateCardForm,
} from './card-forms';

/**
 * Credit cards, managed month by month: summary, earlier unpaid bills, this month's bills
 * with Mark paid, creating a month's bills, and managing the cards themselves.
 */
@Component({
  selector: 'app-cards-page',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    BillList,
    EditDialog,
    EmptyState,
    ErrorState,
    ListSkeleton,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cards-page.html',
  styleUrl: './cards-page.scss',
})
export class CardsPage {
  protected readonly service = inject(CardsService);
  protected readonly portfolios = inject(PortfolioService);
  protected readonly bp = inject(BreakpointService);
  protected readonly today = localIsoDate();
  protected readonly cardNameMax = CARD_NAME_MAX;
  protected readonly notesMax = NOTES_MAX;

  protected readonly month = signal(monthStart(this.today));
  protected readonly isCurrentMonth = computed(() => this.month() === monthStart(this.today));
  protected readonly monthLabel = computed(() => formatMonth(this.month()));

  protected readonly cardDialog = new DialogForm<CardForm>();
  protected readonly billDialog = new DialogForm<BillForm>();
  protected readonly billInEdit = signal<CardBill | null>(null);
  /** Id of the bill being marked paid, for its button's busy state. */
  protected readonly paying = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly message = signal<{
    severity: 'success' | 'warn' | 'error';
    text: string;
  } | null>(null);

  private readonly portfolioNames = computed(
    () => new Map(this.portfolios.portfolios().map((p) => [p.id, p.name])),
  );
  protected readonly showPortfolio = computed(() => this.portfolios.scopeIds().length > 1);
  private readonly scopeSet = computed(() => new Set(this.portfolios.scopeIds()));

  protected readonly cards = computed(() =>
    this.service.cards().filter((c) => this.scopeSet().has(c.portfolio_id)),
  );
  private readonly bills = computed(() =>
    this.service.bills().filter((b) => this.scopeSet().has(b.portfolio_id)),
  );
  protected readonly summary = computed(() =>
    cardsSummary(this.bills(), this.portfolios.scopeIds(), this.today),
  );
  protected readonly monthRows = computed(() =>
    buildBillRows(
      this.bills().filter((b) => b.statement_month === this.month()),
      this.portfolioNames(),
      this.today,
    ),
  );
  protected readonly earlierRows = computed(() =>
    buildBillRows(
      earlierUnsettled(this.bills(), this.month(), this.today),
      this.portfolioNames(),
      this.today,
    ),
  );
  /**
   * Active cards in scope that could get a bill for the selected month but have none yet.
   * Cards without a bill or due day are left out (the card list flags them).
   */
  protected readonly missingBills = computed(() => {
    const billed = new Set(this.monthRows().map((r) => r.bill.card_id));
    return this.cards().filter((c) => c.is_active && c.bill_day && c.due_day && !billed.has(c.id));
  });

  protected readonly nextDueText = computed(() => {
    const next = this.summary().nextDue;
    return next ? next.bill.card_name : 'All clear';
  });
  protected readonly nextDueNote = computed(() => {
    const next = this.summary().nextDue;
    if (!next) return 'Nothing to pay';
    return `${dueLabel(next.bill.due_date, this.today)} · ${formatDate(next.bill.due_date)}`;
  });

  protected readonly portfolioOptions = computed(() =>
    this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  );

  protected date(value: string | null): string {
    return formatDate(value);
  }

  protected portfolioName(id: string): string {
    return this.portfolioNames().get(id) ?? '';
  }

  protected cardDays(card: CreditCard): string {
    if (!card.bill_day || !card.due_day) return 'Bill day or due day missing';
    return `Statement on the ${ordinal(card.bill_day)}, due on the ${ordinal(card.due_day)}`;
  }

  protected shiftMonth(n: number): void {
    this.month.update((m) => addMonths(m, n));
    this.message.set(null);
  }

  protected goToThisMonth(): void {
    this.month.set(monthStart(this.today));
    this.message.set(null);
  }

  protected async createBills(): Promise<void> {
    this.creating.set(true);
    const { error, created, skipped } = await this.service.createBills(this.cards(), this.month());
    this.creating.set(false);
    if (error) {
      this.message.set({ severity: 'error', text: error });
      return;
    }
    const parts = [
      `Created ${created} ${created === 1 ? 'bill' : 'bills'} for ${this.monthLabel()}.`,
    ];
    if (skipped.length) {
      parts.push(`Skipped ${skipped.join(', ')}: add the bill day and due day first.`);
    }
    this.message.set({ severity: skipped.length ? 'warn' : 'success', text: parts.join(' ') });
  }

  protected async markPaid(row: BillRow): Promise<void> {
    this.paying.set(row.id);
    const error = await this.service.markPaid(row.bill, this.today);
    this.paying.set(null);
    this.message.set(error ? { severity: 'error', text: error } : null);
  }

  protected editBill(row: BillRow): void {
    this.billInEdit.set(row.bill);
    this.billDialog.show(billFormFrom(row.bill), row.id);
  }

  protected billHeader(): string {
    const bill = this.billInEdit();
    return bill ? `${bill.card_name} · ${formatMonth(bill.statement_month)}` : 'Bill';
  }

  protected saveBill(): void {
    void this.billDialog.submit(validateBillForm, (value, id) =>
      this.service.updateBill(id as string, value),
    );
  }

  protected removeBill(): void {
    const id = this.billDialog.editingId();
    if (id) void this.billDialog.run(() => this.service.removeBill(id));
  }

  protected addCard(): void {
    this.cardDialog.show(
      emptyCardForm(this.portfolios.scope() ?? this.portfolios.active()[0]?.id ?? ''),
    );
  }

  protected editCard(card: CreditCard): void {
    this.cardDialog.show(cardFormFrom(card), card.id);
  }

  protected saveCard(): void {
    void this.cardDialog.submit(validateCardForm, (value, id) =>
      this.service.saveCard(value, id ?? undefined),
    );
  }

  protected removeCard(): void {
    const id = this.cardDialog.editingId();
    if (id) void this.cardDialog.run(() => this.service.removeCard(id));
  }
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}
