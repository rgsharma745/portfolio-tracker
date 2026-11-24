import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { navQuotes } from '../calc/mf';
import { priceQuotes, usdInrRate } from '../calc/stocks';
import { Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type MfHolding = Tables<'mf_holdings'>;
export type StockHolding = Tables<'stock_holdings'>;
export type RsuGrant = Tables<'rsu_grants'>;
export type SavingsAccount = Tables<'savings_accounts'>;
export type NavLatest = Tables<'mf_nav_latest'>;
export type PriceLatest = Tables<'stock_price_latest'>;
export type FxLatest = Tables<'fx_latest'>;

export type MfHoldingInput = Omit<TablesInsert<'mf_holdings'>, 'owner_id'>;
export type StockHoldingInput = Omit<TablesInsert<'stock_holdings'>, 'owner_id'>;
export type RsuGrantInput = Omit<TablesInsert<'rsu_grants'>, 'owner_id'>;
export type SavingsAccountInput = Omit<TablesInsert<'savings_accounts'>, 'owner_id'>;

type HoldingTable = 'mf_holdings' | 'stock_holdings' | 'rsu_grants' | 'savings_accounts';

/**
 * Holdings (funds, stocks, RSU grants, savings) and the latest market data that values them.
 * Everything is a few dozen rows, so it is loaded together once and shared by every page;
 * the calculations in core/calc turn it into values and totals.
 */
@Injectable({ providedIn: 'root' })
export class HoldingsService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly mf = signal<MfHolding[]>([]);
  readonly stocks = signal<StockHolding[]>([]);
  readonly rsu = signal<RsuGrant[]>([]);
  readonly savings = signal<SavingsAccount[]>([]);
  readonly navs = signal<NavLatest[]>([]);
  readonly prices = signal<PriceLatest[]>([]);
  readonly fx = signal<FxLatest[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** True once data has loaded at least once, so a refresh does not flash skeletons. */
  readonly loaded = signal(false);

  readonly navQuotes = computed(() => navQuotes(this.navs()));
  readonly priceQuotes = computed(() => priceQuotes(this.prices()));
  readonly usdInr = computed(() => usdInrRate(this.fx()));

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
    const db = this.supabase;
    const results = await Promise.all([
      this.loadMf(),
      db.from('stock_holdings').select('*').order('symbol'),
      db.from('rsu_grants').select('*').order('grant_date', { nullsFirst: false }),
      db.from('savings_accounts').select('*').order('bank'),
      db.from('mf_nav_latest').select('*'),
      db.from('stock_price_latest').select('*'),
      db.from('fx_latest').select('*'),
    ] as const);
    this.loading.set(false);
    if (results.some((r) => r.error)) {
      this.error.set('Could not load your holdings.');
      return;
    }
    const [mf, stocks, rsu, savings, navs, prices, fx] = results;
    this.mf.set(mf.data ?? []);
    this.stocks.set(stocks.data ?? []);
    this.rsu.set(rsu.data ?? []);
    this.savings.set(savings.data ?? []);
    this.navs.set(navs.data ?? []);
    this.prices.set(prices.data ?? []);
    this.fx.set(fx.data ?? []);
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  private async loadMf() {
    const data: MfHolding[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const result = await this.supabase
        .from('mf_holdings')
        .select('*')
        .order('scheme_name')
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (result.error) return result;
      data.push(...result.data);
      if (result.data.length < pageSize) return { data, error: null };
    }
  }

  async saveMf(row: MfHoldingInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('mf_holdings');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'This fund and folio are already in that portfolio.');
  }

  async saveStock(row: StockHoldingInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('stock_holdings');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'This stock is already in that portfolio.');
  }

  async saveRsu(row: RsuGrantInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('rsu_grants');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'A grant with this label already exists for that symbol.');
  }

  async saveSavings(row: SavingsAccountInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('savings_accounts');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'This bank is already in that portfolio.');
  }

  async remove(table: HoldingTable, id: string): Promise<WriteError> {
    const { error } = await this.supabase.from(table).delete().eq('id', id);
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
