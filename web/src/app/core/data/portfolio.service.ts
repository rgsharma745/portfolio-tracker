import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

export type Portfolio = Tables<'portfolios'>;

/** `null` = All active portfolios (the family total). */
export type PortfolioScope = string | null;

const SCOPE_KEY = 'portfolio_scope';
export const PORTFOLIO_NAME_MAX = 40;

/** Outcome of a write: `null` on success, otherwise a message for the owner. */
export type WriteError = string | null;

/** Rows that deleting a portfolio would remove (ON DELETE CASCADE). */
export interface PortfolioContents {
  mutualFunds: number;
  stocks: number;
  rsuGrants: number;
  savingsAccounts: number;
  creditCards: number;
}

/**
 * Portfolios and the selected scope (portfolio switcher). The scope is saved in the
 * `settings` table so it follows the owner across devices; default is All.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly portfolios = signal<Portfolio[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** True once portfolios have loaded at least once (avoids flashing the welcome screen). */
  readonly loaded = signal(false);
  private readonly storedScope = signal<PortfolioScope>(null);

  readonly active = computed(() => this.portfolios().filter((p) => p.is_active));
  /** The selected portfolio id, or null for All. Falls back to All if the stored one is gone. */
  readonly scope = computed<PortfolioScope>(() => {
    const id = this.storedScope();
    return id && this.active().some((p) => p.id === id) ? id : null;
  });
  /** Portfolio ids that totals should include for the current scope. */
  readonly scopeIds = computed(() => {
    const id = this.scope();
    return id ? [id] : this.active().map((p) => p.id);
  });

  constructor() {
    effect(() => {
      this.refresher.tick();
      if (this.auth.isSignedIn()) {
        void this.load();
      } else {
        this.portfolios.set([]);
        this.storedScope.set(null);
        this.loaded.set(false);
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const [portfolios, setting] = await Promise.all([
      this.supabase.from('portfolios').select('*').order('sort_order').order('name'),
      this.supabase.from('settings').select('value').eq('key', SCOPE_KEY).maybeSingle(),
    ]);
    this.loading.set(false);
    if (portfolios.error) {
      this.error.set('Could not load portfolios.');
      return;
    }
    this.portfolios.set(portfolios.data);
    this.storedScope.set(parseScope(setting.data?.value));
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async create(name: string): Promise<WriteError> {
    const invalid = validateName(name);
    if (invalid) return invalid;
    const nextOrder = Math.max(0, ...this.portfolios().map((p) => p.sort_order)) + 1;
    const { error } = await this.supabase
      .from('portfolios')
      .insert({ name: name.trim(), sort_order: nextOrder });
    return this.afterWrite(error);
  }

  async rename(id: string, name: string): Promise<WriteError> {
    const invalid = validateName(name);
    if (invalid) return invalid;
    const { error } = await this.supabase
      .from('portfolios')
      .update({ name: name.trim() })
      .eq('id', id);
    return this.afterWrite(error);
  }

  async setActive(id: string, isActive: boolean): Promise<WriteError> {
    const { error } = await this.supabase
      .from('portfolios')
      .update({ is_active: isActive })
      .eq('id', id);
    return this.afterWrite(error);
  }

  async move(id: string, direction: -1 | 1): Promise<WriteError> {
    for (const change of reorder(this.portfolios(), id, direction)) {
      const { error } = await this.supabase
        .from('portfolios')
        .update({ sort_order: change.sort_order })
        .eq('id', change.id);
      if (error) return this.afterWrite(error);
    }
    return this.afterWrite(null);
  }

  /** Permanently deletes the portfolio and, by cascade, everything in it. */
  async remove(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('portfolios').delete().eq('id', id);
    return this.afterWrite(error);
  }

  async contents(id: string): Promise<PortfolioContents> {
    const count = async (
      table: 'mf_holdings' | 'stock_holdings' | 'rsu_grants' | 'savings_accounts' | 'credit_cards',
    ) => {
      const { count: n } = await this.supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('portfolio_id', id);
      return n ?? 0;
    };
    const [mutualFunds, stocks, rsuGrants, savingsAccounts, creditCards] = await Promise.all([
      count('mf_holdings'),
      count('stock_holdings'),
      count('rsu_grants'),
      count('savings_accounts'),
      count('credit_cards'),
    ]);
    return { mutualFunds, stocks, rsuGrants, savingsAccounts, creditCards };
  }

  private async afterWrite(error: { code?: string } | null): Promise<WriteError> {
    if (error)
      return error.code === '23505'
        ? 'A portfolio with this name already exists.'
        : 'Could not save. Try again.';
    await this.load();
    return null;
  }

  async setScope(scope: PortfolioScope): Promise<void> {
    this.storedScope.set(scope);
    await this.supabase
      .from('settings')
      .upsert({ key: SCOPE_KEY, value: { portfolioId: scope } }, { onConflict: 'owner_id,key' });
  }
}

export function validateName(name: string): WriteError {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > PORTFOLIO_NAME_MAX) return `Use at most ${PORTFOLIO_NAME_MAX} characters.`;
  return null;
}

/**
 * Moves one portfolio up (-1) or down (+1) and renumbers sort_order 1..n.
 * Returns only the rows whose sort_order changes.
 */
export function reorder(
  portfolios: readonly Pick<Portfolio, 'id' | 'sort_order'>[],
  id: string,
  direction: -1 | 1,
): { id: string; sort_order: number }[] {
  const ordered = [...portfolios];
  const from = ordered.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered
    .map((p, index) => ({ id: p.id, sort_order: index + 1, previous: p.sort_order }))
    .filter((p) => p.sort_order !== p.previous)
    .map(({ id: rowId, sort_order }) => ({ id: rowId, sort_order }));
}

export function parseScope(value: unknown): PortfolioScope {
  if (value && typeof value === 'object' && 'portfolioId' in value) {
    const id = (value as { portfolioId: unknown }).portfolioId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
