import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type PfEntry = Tables<'pf_entries'>;
export type PfEntryInput = Omit<TablesInsert<'pf_entries'>, 'owner_id'>;

/** Provident fund rows (docs/DATA_MODEL.md, "PF"): monthly contributions and yearly interest. */
@Injectable({ providedIn: 'root' })
export class PfService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly entries = signal<PfEntry[]>([]);
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
    const { data, error } = await this.supabase
      .from('pf_entries')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('company');
    this.loading.set(false);
    if (error || !data) {
      this.error.set('Could not load your PF.');
      return;
    }
    this.entries.set(data);
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async save(row: PfEntryInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('pf_entries');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(
      error,
      row.contribution_type === 'interest'
        ? 'Interest for this company and financial year is already entered.'
        : 'This company already has a contribution for that wage month.',
    );
  }

  async remove(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('pf_entries').delete().eq('id', id);
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
