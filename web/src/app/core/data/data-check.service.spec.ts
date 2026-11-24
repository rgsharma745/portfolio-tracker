import { TestBed } from '@angular/core/testing';
import { DataCheckService } from './data-check.service';
import { SUPABASE } from './supabase.client';

type Rows = Record<string, unknown[]>;

/** Every table answers with its rows; `failing` answers with an error instead. */
function fakeSupabase(rows: Rows, failing?: string) {
  return {
    from: (table: string) => {
      const result =
        table === failing
          ? { data: null, error: { message: 'boom' } }
          : {
              data: table === 'job_runs' ? (rows[table]?.[0] ?? null) : (rows[table] ?? []),
              error: null,
            };
      const builder = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return builder;
    },
  };
}

function create(rows: Rows, failing?: string): DataCheckService {
  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE, useValue: fakeSupabase(rows, failing) }],
  });
  return TestBed.inject(DataCheckService);
}

describe('DataCheckService', () => {
  it('reports a fund whose scheme code has no NAV', async () => {
    const service = create({
      portfolios: [{ id: 'p', name: 'Me', is_active: true }],
      mf_holdings: [{ id: 'f', scheme_name: 'Index Fund', scheme_code: '999', portfolio_id: 'p' }],
      mf_nav_latest: [{ scheme_code: '100' }],
    });
    const done = service.load();
    expect(service.loading()).toBe(true);
    await done;
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.problems().length).toBeGreaterThan(0);
    expect(JSON.stringify(service.problems())).toContain('Index Fund');
  });

  it('finds nothing when every holding is priced', async () => {
    const service = create({
      portfolios: [{ id: 'p', name: 'Me', is_active: true }],
      mf_holdings: [{ id: 'f', scheme_name: 'Index Fund', scheme_code: '100', portfolio_id: 'p' }],
      mf_nav_latest: [{ scheme_code: '100' }],
      job_runs: [{ message: 'ok' }],
    });
    await service.load();
    expect(service.problems()).toEqual([]);
  });

  it('shows an error, not an empty "all good", when a query fails', async () => {
    const service = create({}, 'stock_holdings');
    await service.load();
    expect(service.error()).toBe('Could not run the data check.');
    expect(service.problems()).toEqual([]);
    expect(service.loading()).toBe(false);
  });
});
