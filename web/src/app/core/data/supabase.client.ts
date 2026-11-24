import { InjectionToken } from '@angular/core';
import { AuthClient, type GoTrueClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { env } from '../../../environments/env';
import { Database } from '../db.types';

/**
 * Auth and table queries: all the app uses. Built from Supabase's own auth-js and
 * postgrest-js instead of `createClient` from supabase-js, which also bundles the realtime,
 * storage and functions clients (~120 kB) into the first download.
 */
export interface AppSupabaseClient {
  auth: GoTrueClient;
  from: PostgrestClient<Database>['from'];
  rpc: PostgrestClient<Database>['rpc'];
}

/**
 * The single Supabase client. Inject it only from services in core/,
 * never from components.
 */
export const SUPABASE = new InjectionToken<AppSupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () => {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      throw new Error(
        'Supabase is not configured: set NG_APP_SUPABASE_URL and NG_APP_SUPABASE_ANON_KEY.',
      );
    }
    return createAppClient(env.supabaseUrl, env.supabaseAnonKey);
  },
});

/** Same settings as `createClient` with the options the app used before. */
export function createAppClient(url: string, key: string): AppSupabaseClient {
  const base = new URL(url);
  const auth = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    // supabase-js's default key, so sessions saved before this change still load.
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  });

  // Every table request carries the signed-in user's token, so RLS sees the owner.
  const fetchWithAuth: typeof fetch = async (input, init) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', key);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${data.session?.access_token ?? key}`);
    }
    return fetch(input, { ...init, headers });
  };
  const rest = new PostgrestClient<Database>(new URL('rest/v1', base).href, {
    fetch: fetchWithAuth,
  });

  return { auth, from: rest.from.bind(rest), rpc: rest.rpc.bind(rest) };
}
