import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type NpsHolding = Tables<'nps_holdings'>;
export type NpsHoldingInput = Omit<TablesInsert<'nps_holdings'>, 'owner_id'>;
export type NpsContribution = Tables<'nps_contributions'>;
export type NpsContributionInput = Omit<TablesInsert<'nps_contributions'>, 'owner_id'>;
export type NpsNav = Tables<'nps_nav_latest'>;

/** New units for one scheme row, from a statement. */
export interface NpsUnitsUpdate {
  id: string;
  units: number;
}

/**
 * National Pension System (docs/DATA_MODEL.md, "NPS"): units per account and scheme,
 * contributions, and the latest NAV of each held scheme.
 */
@Injectable({ providedIn: 'root' })
export class NpsService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly holdings = signal<NpsHolding[]>([]);
  readonly contributions = signal<NpsContribution[]>([]);
  readonly navs = signal<NpsNav[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      this.refresher.tick();
      if (this.auth.isSignedIn()) {
        void this.load();
      } else {
        this.loaded.set(false);
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const db = this.supabase;
    const [holdings, contributions, navs] = await Promise.all([
      db.from('nps_holdings').select('*').order('account').order('scheme_class'),
      db
        .from('nps_contributions')
        .select('*')
        .order('contribution_date', { ascending: false })
        .order('account'),
      db.from('nps_nav_latest').select('*'),
    ] as const);
    this.loading.set(false);
    if (holdings.error || contributions.error || navs.error) {
      this.error.set('Could not load your NPS.');
      return;
    }
    this.holdings.set(holdings.data ?? []);
    this.contributions.set(contributions.data ?? []);
    this.navs.set(navs.data ?? []);
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async saveHolding(row: NpsHoldingInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('nps_holdings');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error, 'This account already has a scheme of that class.');
  }

  async removeHolding(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('nps_holdings').delete().eq('id', id);
    return this.afterWrite(error);
  }

  /** New units for several schemes of one account, all as of one statement date. */
  async updateUnits(updates: readonly NpsUnitsUpdate[], asOf: string): Promise<WriteError> {
    const table = () => this.supabase.from('nps_holdings');
    const results = await Promise.all(
      updates.map((u) => table().update({ units: u.units, units_as_of: asOf }).eq('id', u.id)),
    );
    return this.afterWrite(results.find((r) => r.error)?.error ?? null);
  }

  async saveContribution(row: NpsContributionInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('nps_contributions');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error);
  }

  async removeContribution(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('nps_contributions').delete().eq('id', id);
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
