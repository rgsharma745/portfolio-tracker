import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { FdService, type FixedDepositInput } from './fd.service';
import { RefreshService } from './refresh.service';
import { SUPABASE } from './supabase.client';

interface Call {
  op: string;
  args: unknown[];
}

/** The fixed_deposits query builder: records calls; `error` fails reads and writes. */
function fakeSupabase(rows: unknown[], error: object | null = null) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data: error ? null : rows, error }),
  };
  for (const op of ['select', 'order', 'eq', 'insert', 'update', 'delete']) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  return { client: { from: () => builder }, calls };
}

function create(rows: unknown[] = [], error: object | null = null, signedIn = false) {
  const fake = fakeSupabase(rows, error);
  const isSignedIn = signal(signedIn);
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: fake.client },
      { provide: AuthService, useValue: { isSignedIn } },
    ],
  });
  return {
    fds: TestBed.inject(FdService),
    refresher: TestBed.inject(RefreshService),
    isSignedIn,
    calls: fake.calls,
  };
}

const row: FixedDepositInput = {
  portfolio_id: 'me',
  bank: 'SBI',
  start_date: '2025-11-10',
  maturity_date: '2026-11-10',
  principal: 100_000,
  rate: 7,
  compounding: 'quarterly',
};

describe('FdService', () => {
  it('loads FDs by maturity, then bank, and marks the data fresh', async () => {
    const { fds, refresher, calls } = create([{ id: 'a' }]);
    const done = fds.load();
    expect(fds.loading()).toBe(true);
    await done;
    expect(fds.loading()).toBe(false);
    expect(fds.loaded()).toBe(true);
    expect(fds.deposits()).toEqual([{ id: 'a' }]);
    expect(calls.filter((c) => c.op === 'order').map((c) => c.args[0])).toEqual([
      'maturity_date',
      'bank',
    ]);
    expect(refresher.lastUpdated()).not.toBeNull();
  });

  it('shows an error and keeps what it had when loading fails', async () => {
    const { fds } = create([], { code: '500' });
    await fds.load();
    expect(fds.error()).toBe('Could not load your fixed deposits.');
    expect(fds.loaded()).toBe(false);
  });

  it('loads on sign-in and forgets it had loaded on sign-out', async () => {
    const { fds, isSignedIn } = create([{ id: 'a' }], null, true);
    TestBed.tick();
    await vi.waitFor(() => expect(fds.loaded()).toBe(true));
    isSignedIn.set(false);
    TestBed.tick();
    expect(fds.loaded()).toBe(false);
  });

  it('adds a new FD, edits one by id and deletes by id, reloading after each', async () => {
    const { fds, calls } = create();
    expect(await fds.save(row)).toBeNull();
    expect(await fds.save(row, 'a')).toBeNull();
    expect(await fds.remove('a')).toBeNull();
    const writes = calls.filter((c) => !['select', 'order'].includes(c.op));
    expect(writes).toEqual([
      { op: 'insert', args: [row] },
      { op: 'update', args: [row] },
      { op: 'eq', args: ['id', 'a'] },
      { op: 'delete', args: [] },
      { op: 'eq', args: ['id', 'a'] },
    ]);
    expect(calls.filter((c) => c.op === 'select').length).toBe(3);
  });

  it('explains a rejected write instead of reloading', async () => {
    const { fds, calls } = create([], { code: '23514' });
    expect(await fds.save(row)).toBe('Check the numbers: one of them is not allowed.');
    TestBed.resetTestingModule();
    const other = create([], { code: '42501' });
    expect(await other.fds.remove('a')).toBe('Could not save. Try again.');
    expect(other.calls.some((c) => c.op === 'select')).toBe(false);
    expect(calls.some((c) => c.op === 'select')).toBe(false);
  });
});
