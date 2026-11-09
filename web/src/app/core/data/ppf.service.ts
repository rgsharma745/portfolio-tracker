import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type PpfEntry = Tables<'ppf_entries'>;
export type PpfEntryInput = Omit<TablesInsert<'ppf_entries'>, 'owner_id'>;

/** Public Provident Fund rows (docs/DATA_MODEL.md, "PPF"): deposits and yearly interest. */
@Injectable({ providedIn: 'root' })
export class PpfService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly entries = signal<PpfEntry[]>([]);
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
      .from('ppf_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('account');
    this.loading.set(false);
    if (error || !data) {
      this.error.set('Could not load your PPF.');
      return;
    }
    this.entries.set(data);
    this.loaded.set(true);
    this.refresher.markUpdated();
  }

  async save(row: PpfEntryInput, id?: string): Promise<WriteError> {
    const table = this.supabase.from('ppf_entries');
    const { error } = id ? await table.update(row).eq('id', id) : await table.insert(row);
    return this.afterWrite(
      error,
      'Interest for this account and financial year is already entered.',
    );
  }

  async remove(id: string): Promise<WriteError> {
    const { error } = await this.supabase.from('ppf_entries').delete().eq('id', id);
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
