import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { billsToCreate } from '../calc/cards';
import { Tables, TablesInsert, TablesUpdate } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type CreditCard = Tables<'credit_cards'>;
export type CreditCardInput = Omit<TablesInsert<'credit_cards'>, 'owner_id'>;
export type CardBillUpdate = Pick<
  TablesUpdate<'card_bills'>,
  'amount' | 'paid_amount' | 'paid_on' | 'due_date' | 'notes'
>;

/** A bill with its card's name and portfolio (bills inherit the card's portfolio). */
export interface CardBill extends Tables<'card_bills'> {
  card_name: string;
  portfolio_id: string;
}

/** Credit cards and their monthly bills (docs/DATA_MODEL.md, "Credit card bills"). */
@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly cards = signal<CreditCard[]>([]);
  readonly bills = signal<CardBill[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      this.refresher.tick();
      if (this.auth.isSignedIn()) {
        void this.refresher.track(this.load());
      } else {
        this.loaded.set(false);
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const [cards, bills] = await Promise.all([
      this.supabase.from('credit_cards').select('*').order('name'),
      this.supabase
        .from('card_bills')
        .select('*, credit_cards!inner(name, portfolio_id)')
        .order('due_date'),
    ]);
    this.loading.set(false);
    if (cards.error || bills.error) {
      this.error.set('Could not load your cards.');
      return;
    }
    this.cards.set(cards.data);
    this.bills.set(
      bills.data.map(({ credit_cards, ...bill }) => ({
        ...bill,
        card_name: credit_cards.name,
        portfolio_id: credit_cards.portfolio_id,
      })),
    );
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async saveCard(row: CreditCardInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('credit_cards');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'A card with this name already exists.');
  }

  /** Deletes the card and, by cascade, all its bills. */
  async removeCard(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('credit_cards').delete().eq('id', id);
    return this.afterWrite(error);
  }

  /**
   * "Create this month's bills" for the given cards (the ones in scope). Returns the number
   * created and the names of cards skipped for missing bill or due days.
   */
  async createBills(
    cards: readonly CreditCard[],
    month: string,
  ): Promise<{ error: WriteError; created: number; skipped: string[] }> {
    const { bills, skipped } = billsToCreate(cards, this.bills(), month);
    const skippedNames = skipped.map((id) => cards.find((c) => c.id === id)?.name ?? id);
    if (!bills.length) return { error: null, created: 0, skipped: skippedNames };
    const { error } = await this.supabase
      .from('card_bills')
      .upsert(bills, { onConflict: 'card_id,statement_month', ignoreDuplicates: true });
    return { error: await this.afterWrite(error), created: bills.length, skipped: skippedNames };
  }

  async updateBill(id: string, patch: CardBillUpdate): Promise<WriteError> {
    const { error } = await this.supabase.from('card_bills').update(patch).eq('id', id);
    return this.afterWrite(error);
  }

  /** Mark paid: paid amount = amount, paid on = today. */
  markPaid(bill: CardBill, today: string): Promise<WriteError> {
    return this.updateBill(bill.id, { paid_amount: bill.amount ?? 0, paid_on: today });
  }

  async removeBill(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('card_bills').delete().eq('id', id);
    return this.afterWrite(error);
  }

  private async afterWrite(
    error: { code?: string } | null,
    duplicate?: string,
  ): Promise<WriteError> {
    if (error) return writeErrorMessage(error, duplicate);
    await this.load();
    return null;
  }
}
