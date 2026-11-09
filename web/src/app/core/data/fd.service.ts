import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type FixedDeposit = Tables<'fixed_deposits'>;
export type FixedDepositInput = Omit<TablesInsert<'fixed_deposits'>, 'owner_id'>;

/** Fixed deposits (docs/DATA_MODEL.md, "Fixed deposits"). */
@Injectable({ providedIn: 'root' })
export class FdService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly deposits = signal<FixedDeposit[]>([]);
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
    const { data, error } = await this.supabase
      .from('fixed_deposits')
      .select('*')
      .order('maturity_date')
      .order('bank');
    this.loading.set(false);
    if (error || !data) {
      this.error.set('Could not load your fixed deposits.');
      return;
    }
    this.deposits.set(data);
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async save(row: FixedDepositInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('fixed_deposits');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(error);
  }

  async remove(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('fixed_deposits').delete().eq('id', id);
    return this.afterWrite(error);
  }

  private async afterWrite(error: { code?: string } | null): Promise<WriteError> {
    if (error) return writeErrorMessage(error);
    await this.load();
    return null;
  }
}
