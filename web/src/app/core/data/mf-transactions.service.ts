import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

export type MfTransaction = Tables<'mf_transactions'>;

@Injectable({ providedIn: 'root' })
export class MfTransactionsService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly transactions = signal<MfTransaction[]>([]);
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
    const all: MfTransaction[] = [];
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.supabase
        .from('mf_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + batchSize - 1);
      if (error) {
        this.loading.set(false);
        this.error.set('Could not load your mutual fund transactions.');
        return;
      }
      all.push(...(data ?? []));
      if (!data || data.length < batchSize) break;
    }
    this.transactions.set(all);
    this.loaded.set(true);
    this.loading.set(false);
    this.refresher.markUpdated();
  }
}
