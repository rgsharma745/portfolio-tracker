import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

export type Portfolio = Tables<'portfolios'>;

/** `null` = All active portfolios (the family total). */
export type PortfolioScope = string | null;

const SCOPE_KEY = 'portfolio_scope';

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
    this.refresher.markUpdated();
  }

  async setScope(scope: PortfolioScope): Promise<void> {
    this.storedScope.set(scope);
    await this.supabase
      .from('settings')
      .upsert({ key: SCOPE_KEY, value: { portfolioId: scope } }, { onConflict: 'owner_id,key' });
  }
}

export function parseScope(value: unknown): PortfolioScope {
  if (value && typeof value === 'object' && 'portfolioId' in value) {
    const id = (value as { portfolioId: unknown }).portfolioId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
