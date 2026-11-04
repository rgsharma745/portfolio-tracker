import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { Portfolio, PortfolioService, parseScope } from './portfolio.service';
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
function fakeSupabase(portfolios: Portfolio[], storedScope: unknown) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const query = (result: unknown) => {
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve(result),
      upsert,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    upsert,
    client: {
      from: (table: string) =>
        table === 'portfolios'
          ? query({ data: portfolios, error: null })
          : query({ data: storedScope === undefined ? null : { value: storedScope }, error: null }),
    },
  };
}

describe('PortfolioService', () => {
  async function create(portfolios: Portfolio[], storedScope?: unknown) {
    const fake = fakeSupabase(portfolios, storedScope);
    TestBed.configureTestingModule({
      providers: [
        { provide: SUPABASE, useValue: fake.client },
        { provide: AuthService, useValue: { isSignedIn: signal(true) } },
      ],
    });
    const service = TestBed.inject(PortfolioService);
    await service.load();
    return { service, upsert: fake.upsert };
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
