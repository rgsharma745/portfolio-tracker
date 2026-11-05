import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Session } from '@supabase/auth-js';
import { SUPABASE } from '../data/supabase.client';

/**
 * Session state as signals. `session()` is `undefined` until the stored session
 * (or a magic-link code in the URL) has been read, then `Session | null`.
 * supabase-js persists the session and refreshes the token; if a refresh fails it
 * emits SIGNED_OUT and we return to the login page.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly session = signal<Session | null | undefined>(undefined);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isSignedIn = computed(() => !!this.session());

  /** Resolves once the initial session is known. */
  readonly ready: Promise<void>;

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'SIGNED_OUT') {
        void this.router.navigateByUrl('/login');
      }
    });
    this.ready = this.supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });
  }

  /**
   * Emails a one-time sign-in link. Never creates users (public sign-up is disabled);
   * an unknown address fails silently on purpose so the page does not reveal which
   * emails exist.
   */
  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${this.document.location.origin}/`,
      },
    });
    if (error && !isUnknownUserError(error)) {
      throw error;
    }
  }

  /**
   * Signs in with the 6-digit code from the same email. Needed for the app installed on an
   * iPhone home screen: it has its own storage, so a link that opens in Safari signs in
   * Safari, not the app. Throws on a wrong or expired code.
   */
  async verifyCode(email: string, code: string): Promise<void> {
    const { data, error } = await this.supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error) throw error;
    this.session.set(data.session);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.session.set(null);
    await this.router.navigateByUrl('/login');
  }
}

function isUnknownUserError(error: { code?: string; status?: number }): boolean {
  return error.code === 'otp_disabled' || error.code === 'user_not_found' || error.status === 422;
}
