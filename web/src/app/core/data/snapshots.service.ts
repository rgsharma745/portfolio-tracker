import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Tables } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

export type PortfolioSnapshot = Tables<'portfolio_snapshots'>;

/** Daily totals per portfolio (written by the snapshot job), for the history chart. */
@Injectable({ providedIn: 'root' })
export class SnapshotsService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresher = inject(RefreshService);

  readonly snapshots = signal<PortfolioSnapshot[]>([]);
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
      .from('portfolio_snapshots')
      .select('*')
      .order('snap_date');
    this.loading.set(false);
    if (error) {
      this.error.set('Could not load the history.');
      return;
    }
    this.snapshots.set(data);
    this.loaded.set(true);
  }
}
