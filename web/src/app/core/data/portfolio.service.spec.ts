import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import {
  Portfolio,
  PortfolioService,
  parseScope,
  reorder,
  validateName,
} from './portfolio.service';
import { SUPABASE } from './supabase.client';

const portfolio = (id: string, name: string, isActive = true): Portfolio => ({
  id,
  name,
  is_active: isActive,
  owner_id: 'owner',
  sort_order: 0,
  created_at: '2026-11-01T00:00:00Z',
});

/** Minimal stand-in for the supabase-js query builder used by PortfolioService. */
function fakeSupabase(portfolios: Portfolio[], storedScope: unknown, writeError: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: writeError });
  const query = (result: unknown) => {
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve(result),
      upsert,
      insert,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    upsert,
    insert,
    client: {
      from: (table: string) =>
        table === 'portfolios'
          ? query({ data: portfolios, error: null })
          : query({ data: storedScope === undefined ? null : { value: storedScope }, error: null }),
    },
  };
}

describe('PortfolioService', () => {
  async function create(portfolios: Portfolio[], storedScope?: unknown, writeError?: unknown) {
    const fake = fakeSupabase(portfolios, storedScope, writeError);
    TestBed.configureTestingModule({
      providers: [
        { provide: SUPABASE, useValue: fake.client },
        { provide: AuthService, useValue: { isSignedIn: signal(true) } },
      ],
    });
    const service = TestBed.inject(PortfolioService);
    await service.load();
    return { service, upsert: fake.upsert, insert: fake.insert };
  }

  it('defaults to All, covering every active portfolio', async () => {
    const { service } = await create([
      portfolio('a', 'Me'),
      portfolio('b', 'Wife'),
      portfolio('c', 'Old', false),
    ]);
    expect(service.scope()).toBeNull();
    expect(service.scopeIds()).toEqual(['a', 'b']);
  });

  it('restores a stored portfolio scope', async () => {
    const { service } = await create([portfolio('a', 'Me'), portfolio('b', 'Wife')], {
      portfolioId: 'b',
    });
    expect(service.scope()).toBe('b');
    expect(service.scopeIds()).toEqual(['b']);
  });

  it('falls back to All when the stored portfolio is inactive or gone', async () => {
    const { service } = await create([portfolio('a', 'Me'), portfolio('b', 'Wife', false)], {
      portfolioId: 'b',
    });
    expect(service.scope()).toBeNull();
  });

  it('saves the selected scope to settings', async () => {
    const { service, upsert } = await create([portfolio('a', 'Me')]);
    await service.setScope('a');
    expect(service.scope()).toBe('a');
    expect(upsert).toHaveBeenCalledWith(
      { key: 'portfolio_scope', value: { portfolioId: 'a' } },
      { onConflict: 'owner_id,key' },
    );
  });
});

describe('parseScope', () => {
  it('accepts only a string portfolio id', () => {
    expect(parseScope({ portfolioId: 'x' })).toBe('x');
    expect(parseScope({ portfolioId: null })).toBeNull();
    expect(parseScope({ portfolioId: 3 })).toBeNull();
    expect(parseScope(null)).toBeNull();
    expect(parseScope('x')).toBeNull();
  });
});

describe('PortfolioService writes', () => {
  function setup(writeError: unknown = null) {
    const fake = fakeSupabase([portfolio('a', 'Me')], undefined, writeError);
    TestBed.configureTestingModule({
      providers: [
        { provide: SUPABASE, useValue: fake.client },
        { provide: AuthService, useValue: { isSignedIn: signal(false) } },
      ],
    });
    return { service: TestBed.inject(PortfolioService), insert: fake.insert };
  }

  it('creates a trimmed portfolio at the end of the order', async () => {
    const { service, insert } = setup();
    service.portfolios.set([portfolio('a', 'Me'), { ...portfolio('b', 'Wife'), sort_order: 4 }]);
    expect(await service.create('  Kids  ')).toBeNull();
    expect(insert).toHaveBeenCalledWith({ name: 'Kids', sort_order: 5 });
  });

  it('explains a duplicate name', async () => {
    const { service } = setup({ code: '23505' });
    expect(await service.create('Me')).toBe('A portfolio with this name already exists.');
  });

  it('rejects an empty name without calling the database', async () => {
    const { service, insert } = setup();
    expect(await service.create('   ')).toBe('Enter a name.');
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('validateName', () => {
  it('requires 1 to 40 characters after trimming', () => {
    expect(validateName('Me')).toBeNull();
    expect(validateName('')).toBe('Enter a name.');
    expect(validateName('x'.repeat(41))).toBe('Use at most 40 characters.');
    expect(validateName(` ${'x'.repeat(40)} `)).toBeNull();
  });
});

describe('reorder', () => {
  const rows = [
    { id: 'a', sort_order: 1 },
    { id: 'b', sort_order: 2 },
    { id: 'c', sort_order: 3 },
  ];

  it('swaps with the neighbour and returns only changed rows', () => {
    expect(reorder(rows, 'c', -1)).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ]);
  });

  it('renumbers gaps and duplicates to 1..n', () => {
    const messy = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 0 },
      { id: 'c', sort_order: 7 },
    ];
    expect(reorder(messy, 'a', 1)).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ]);
  });

  it('does nothing at the edges or for unknown ids', () => {
    expect(reorder(rows, 'a', -1)).toEqual([]);
    expect(reorder(rows, 'c', 1)).toEqual([]);
    expect(reorder(rows, 'zz', 1)).toEqual([]);
  });
});
