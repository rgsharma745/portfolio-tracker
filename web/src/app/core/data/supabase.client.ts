import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { env } from '../../../environments/env';
import { Database } from '../db.types';

export type AppSupabaseClient = SupabaseClient<Database>;

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
    return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  },
});
