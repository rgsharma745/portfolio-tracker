import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { HoldingsService } from './holdings.service';
import { MarketService } from './market.service';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

/**
 * A query builder that records each call and answers reads with `rows[table]`.
 * `errors[table]` makes that table's reads and writes fail with the given Postgres error.
 */
function fakeSupabase(rows: Record<string, unknown[]>, errors: Record<string, object> = {}) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      const error = errors[table] ?? null;
      const result = { data: error ? null : (rows[table] ?? []), error };
      const builder = {
        then: (resolve: (v: unknown) => void) => resolve(result),
        maybeSingle: () => Promise.resolve({ data: rows[table]?.[0] ?? null, error }),
      } as Record<string, unknown>;
      for (const op of ['select', 'order', 'eq', 'limit', 'insert', 'update', 'upsert', 'delete']) {
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return builder;
        };
      }
      return builder;
    },
  };
  return {
    client,
    calls,
    writes: () => calls.filter((c) => c.op !== 'select' && c.op !== 'order'),
  };
}

function create(
  rows: Record<string, unknown[]> = {},
  errors: Record<string, object> = {},
  signedIn = false,
) {
  const fake = fakeSupabase(rows, errors);
  const isSignedIn = signal(signedIn);
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: fake.client },
      { provide: AuthService, useValue: { isSignedIn } },
    ],
  });
  return {
    holdings: TestBed.inject(HoldingsService),
    market: TestBed.inject(MarketService),
    refresher: TestBed.inject(RefreshService),
    isSignedIn,
    ...fake,
  };
}

const usdInr = {
  pair: 'USDINR',
  rate: 84.5,
  prev_rate: 84,
  rate_date: '2026-11-10',
  is_manual: false,
};

describe('HoldingsService', () => {
  it('loads holdings and market data together and marks the data fresh', async () => {
    const { holdings, refresher } = create({
      mf_holdings: [{ id: 'f' }],
      stock_holdings: [{ id: 's' }],
      savings_accounts: [{ id: 'b' }],
      fx_latest: [usdInr],
    });
    const done = holdings.load();
    expect(holdings.loading()).toBe(true);
    await done;
    expect(holdings.loading()).toBe(false);
    expect(holdings.loaded()).toBe(true);
    expect(holdings.mf()).toEqual([{ id: 'f' }]);
    expect(holdings.stocks()).toEqual([{ id: 's' }]);
    expect(holdings.savings()).toEqual([{ id: 'b' }]);
    expect(holdings.usdInr()).toBe(84.5);
    expect(refresher.lastUpdated()).not.toBeNull();
  });

  it('keeps the previous data and shows an error when a query fails', async () => {
    const { holdings } = create({}, { stock_price_latest: { code: '500' } });
    await holdings.load();
    expect(holdings.error()).toBe('Could not load your holdings.');
    expect(holdings.loaded()).toBe(false);
  });

  it('loads when signed in, and forgets it had loaded after signing out', async () => {
    const { holdings, calls, isSignedIn } = create({ mf_holdings: [{ id: 'f' }] }, {}, true);
    TestBed.tick();
    await vi.waitFor(() => expect(holdings.loaded()).toBe(true));
    expect(calls.some((c) => c.table === 'mf_holdings' && c.op === 'select')).toBe(true);
    isSignedIn.set(false);
    TestBed.tick();
    expect(holdings.loaded()).toBe(false);
  });

  it('inserts a new holding and updates an existing one by id, then reloads', async () => {
    const { holdings, writes, calls } = create();
    const row = {
      portfolio_id: 'p',
      scheme_code: '100',
      scheme_name: 'Index',
      units: 1,
      invested: 10,
    };
    expect(await holdings.saveMf(row)).toBeNull();
    expect(await holdings.saveMf(row, 'f')).toBeNull();
    expect(writes().map((c) => [c.table, c.op, ...(c.op === 'eq' ? c.args : [])])).toEqual([
      ['mf_holdings', 'insert'],
      ['mf_holdings', 'update'],
      ['mf_holdings', 'eq', 'id', 'f'],
    ]);
    expect(calls.filter((c) => c.table === 'fx_latest').length).toBe(2);
  });

  it('explains a duplicate in words that fit each kind of holding', async () => {
    const duplicate = { code: '23505' };
    const { holdings } = create(
      {},
      {
        mf_holdings: duplicate,
        stock_holdings: duplicate,
        rsu_grants: duplicate,
        savings_accounts: duplicate,
      },
    );
    const row = {} as never;
    expect(await holdings.saveMf(row)).toBe('This fund and folio are already in that portfolio.');
    expect(await holdings.saveStock(row)).toBe('This stock is already in that portfolio.');
    expect(await holdings.saveRsu(row, 'g')).toBe(
      'A grant with this label already exists for that symbol.',
    );
    expect(await holdings.saveSavings(row)).toBe('This bank is already in that portfolio.');
    expect(await holdings.remove('stock_holdings', 's')).toBe('This already exists.');
  });

  it('deletes by id', async () => {
    const { holdings, writes } = create();
    expect(await holdings.remove('savings_accounts', 'b')).toBeNull();
    expect(writes().map((c) => [c.table, c.op, ...c.args])).toEqual([
      ['savings_accounts', 'delete'],
      ['savings_accounts', 'eq', 'id', 'b'],
    ]);
  });
});

describe('MarketService', () => {
  it('loads the latest run of each job', async () => {
    const run = { job: 'fetch_nav', status: 'success' };
    const { market } = create({ job_runs: [run] });
    await market.loadJobRuns();
    expect(market.error()).toBeNull();
    expect(market.lastRuns().fetch_nav).toEqual(run);
    expect(Object.keys(market.lastRuns())).toEqual([
      'fetch_nav',
      'fetch_nps_nav',
      'fetch_prices',
      'snapshot',
      'backup',
    ]);
  });

  it('shows an error when job runs cannot be read', async () => {
    const { market } = create({}, { job_runs: { code: '42501' } });
    await market.loadJobRuns();
    expect(market.error()).toBe('Could not load job runs.');
    expect(market.loading()).toBe(false);
  });

  it('saves manual overrides the jobs will not overwrite, then reloads the holdings', async () => {
    const { market, writes, calls } = create();
    expect(await market.setStockPrice('AAPL', 190.5, '2026-11-10')).toBeNull();
    expect(await market.setUsdInr(84.2, '2026-11-10')).toBeNull();
    expect(writes().map((c) => [c.table, ...c.args])).toEqual([
      [
        'stock_price_latest',
        {
          symbol: 'AAPL',
          close: 190.5,
          price_date: '2026-11-10',
          source: 'manual',
          is_manual: true,
        },
        { onConflict: 'symbol' },
      ],
      [
        'fx_latest',
        { pair: 'USDINR', rate: 84.2, rate_date: '2026-11-10', is_manual: true },
        { onConflict: 'pair' },
      ],
    ]);
    expect(calls.filter((c) => c.table === 'mf_holdings' && c.op === 'select').length).toBe(2);
  });

  it('removes only manual rows, handing the symbol back to the jobs', async () => {
    const { market, writes } = create();
    await market.removeStockOverride('AAPL');
    await market.removeUsdInrOverride();
    expect(writes().map((c) => [c.table, c.op, ...c.args])).toEqual([
      ['stock_price_latest', 'delete'],
      ['stock_price_latest', 'eq', 'symbol', 'AAPL'],
      ['stock_price_latest', 'eq', 'is_manual', true],
      ['fx_latest', 'delete'],
      ['fx_latest', 'eq', 'pair', 'USDINR'],
      ['fx_latest', 'eq', 'is_manual', true],
    ]);
  });

  it('reports a rejected price instead of reloading', async () => {
    const { market, calls } = create({}, { stock_price_latest: { code: '23514' } });
    expect(await market.setStockPrice('AAPL', -1, '2026-11-10')).toBe(
      'Check the numbers: one of them is not allowed.',
    );
    expect(calls.some((c) => c.table === 'mf_holdings')).toBe(false);
  });
});
