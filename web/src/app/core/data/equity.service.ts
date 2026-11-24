import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Database, Tables, TablesInsert } from '../db.types';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';
import { writeErrorMessage } from './write-error';

export type EquitySecurity = Tables<'equity_securities'>;
export type EquityGrant = Tables<'equity_grants'>;
export type EquitySchedule = Tables<'equity_schedule'>;
export type EquityEvent = Tables<'equity_events'>;
export type EquityLot = Tables<'v_equity_lots'>;
export type EquitySale = Tables<'equity_sales'>;
export type EquitySaleDetail = Tables<'v_equity_sale_details'>;

export type EquityRecord =
  | { table: 'equity_securities'; row: TablesInsert<'equity_securities'> }
  | { table: 'equity_grants'; row: TablesInsert<'equity_grants'> }
  | { table: 'equity_schedule'; row: TablesInsert<'equity_schedule'> }
  | { table: 'equity_events'; row: TablesInsert<'equity_events'> };

type SaleArgs = Database['public']['Functions']['save_equity_sale']['Args'];
interface Ledger {
  securities: EquitySecurity[];
  grants: EquityGrant[];
  schedule: EquitySchedule[];
  events: EquityEvent[];
  lots: EquityLot[];
  sales: EquitySale[];
  saleDetails: EquitySaleDetail[];
}

const EMPTY: Ledger = {
  securities: [],
  grants: [],
  schedule: [],
  events: [],
  lots: [],
  sales: [],
  saleDetails: [],
};

@Injectable({ providedIn: 'root' })
export class EquityService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly refresh = inject(RefreshService);
  private request = 0;
  private lotRequest = 0;

  readonly ledger = signal(EMPTY);
  readonly lots = signal<EquityLot[]>([]);
  readonly loaded = signal(false);
  readonly lotsLoaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly lotsError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.refresh.tick();
      if (this.auth.isSignedIn()) {
        void this.refresh.track(this.loadLots());
      } else {
        this.request++;
        this.lotRequest++;
        this.ledger.set(EMPTY);
        this.lots.set([]);
        this.loaded.set(false);
        this.lotsLoaded.set(false);
        this.error.set(null);
        this.lotsError.set(null);
      }
    });
  }

  async loadLots(): Promise<void> {
    const request = ++this.lotRequest;
    this.lotsError.set(null);
    const lots = await this.read(this.db.from('v_equity_lots').select('*').order('id'));
    if (request !== this.lotRequest) return;
    if (lots === null) {
      this.lotsError.set('Could not load employee equity holdings.');
      return;
    }
    this.lots.set(lots);
    this.lotsLoaded.set(true);
  }

  async load(): Promise<void> {
    const request = ++this.request;
    const lotRequest = ++this.lotRequest;
    this.error.set(null);
    const [securities, grants, schedule, events, lots, sales, saleDetails] = await Promise.all([
      this.read(this.db.from('equity_securities').select('*').order('id')),
      this.read(this.db.from('equity_grants').select('*').order('id')),
      this.read(this.db.from('equity_schedule').select('*').order('id')),
      this.read(this.db.from('equity_events').select('*').order('id')),
      this.read(this.db.from('v_equity_lots').select('*').order('id')),
      this.read(this.db.from('equity_sales').select('*').order('id')),
      this.read(this.db.from('v_equity_sale_details').select('*').order('id')),
    ]);
    if (request !== this.request) return;
    if (!securities || !grants || !schedule || !events || !lots || !sales || !saleDetails) {
      this.error.set('Could not load the employee equity ledger.');
      return;
    }
    this.ledger.set({ securities, grants, schedule, events, lots, sales, saleDetails });
    this.loaded.set(true);
    if (lotRequest === this.lotRequest) {
      this.lots.set(lots);
      this.lotsLoaded.set(true);
      this.lotsError.set(null);
    }
    this.refresh.markUpdated();
  }

  private async read<T>(query: {
    range(from: number, to: number): PromiseLike<{ data: T[] | null; error: object | null }>;
  }): Promise<T[] | null> {
    const pageSize = 500;
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await query.range(offset, offset + pageSize - 1);
      if (result.error || !result.data) return null;
      rows.push(...result.data);
      if (result.data.length < pageSize) return rows;
    }
  }

  async save(record: EquityRecord, id: string): Promise<string | null> {
    // Each insert has a stable client-generated ID so a retry can safely update it.
    const { error } = await this.db.from(record.table).upsert({ ...record.row, id });
    return this.afterWrite(error);
  }

  async saveSale(args: SaleArgs): Promise<string | null> {
    const { error } = await this.db.rpc('save_equity_sale', args);
    return this.afterWrite(error);
  }

  async remove(table: EquityRecord['table'] | 'equity_sales', id: string, portfolioId: string) {
    const { error } =
      table === 'equity_sales'
        ? await this.db.rpc('delete_equity_sale', { p_id: id, p_portfolio: portfolioId })
        : await this.db.from(table).delete().eq('id', id);
    return this.afterWrite(error);
  }

  private async afterWrite(error: { code: string; message: string } | null) {
    if (error?.code === 'P0001') return error.message;
    if (error?.code === '23503') return 'Remove linked records before deleting this entry.';
    if (error) return writeErrorMessage(error);
    await this.load();
    return null;
  }
}
