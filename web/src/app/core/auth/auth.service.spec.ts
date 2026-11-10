import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { Session } from '@supabase/auth-js';
import { SUPABASE } from '../data/supabase.client';
import { AuthService } from './auth.service';

const session = { access_token: 't', user: { id: 'u', email: 'me@example.com' } } as Session;

function setup({
  stored = null as Session | null,
  otpError = null as unknown,
  verifyError = null as unknown,
} = {}) {
  let onChange: (event: string, s: Session | null) => void = () => undefined;
  const auth = {
    onAuthStateChange: (fn: typeof onChange) => (onChange = fn),
    getSession: vi.fn().mockResolvedValue({ data: { session: stored } }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: otpError }),
    verifyOtp: vi
      .fn()
      .mockResolvedValue({ data: { session: verifyError ? null : session }, error: verifyError }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: { auth } },
      { provide: Router, useValue: { navigateByUrl } },
    ],
  });
  const service = TestBed.inject(AuthService);
  return {
    service,
    auth,
    navigateByUrl,
    emit: (event: string, s: Session | null) => onChange(event, s),
  };
}

describe('AuthService', () => {
  it('is unknown until the stored session is read, then signed in or out', async () => {
    const signedIn = setup({ stored: session });
    expect(signedIn.service.session()).toBeUndefined();
    await signedIn.service.ready;
    expect(signedIn.service.isSignedIn()).toBe(true);
    expect(signedIn.service.user()?.email).toBe('me@example.com');

    TestBed.resetTestingModule();
    const signedOut = setup();
    await signedOut.service.ready;
    expect(signedOut.service.session()).toBeNull();
    expect(signedOut.service.isSignedIn()).toBe(false);
    expect(signedOut.service.user()).toBeNull();
  });

  it('returns to the login page when the session ends (failed token refresh)', async () => {
    const { service, emit, navigateByUrl } = setup({ stored: session });
    await service.ready;
    emit('TOKEN_REFRESHED', session);
    expect(navigateByUrl).not.toHaveBeenCalled();
    emit('SIGNED_OUT', null);
    expect(service.isSignedIn()).toBe(false);
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('sends a magic link that never creates a user and returns to this site', async () => {
    const { service, auth } = setup();
    await service.sendMagicLink('me@example.com');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/` },
    });
  });

  it('stays silent for an unknown address, so the page does not reveal which emails exist', async () => {
    for (const otpError of [
      { code: 'otp_disabled' },
      { code: 'user_not_found' },
      { status: 422 },
    ]) {
      TestBed.resetTestingModule();
      const { service } = setup({ otpError });
      await expect(service.sendMagicLink('who@example.com')).resolves.toBeUndefined();
    }
  });

  it('throws other errors (rate limit, network) so the page can say so', async () => {
    const { service } = setup({ otpError: { status: 429, message: 'rate limit' } });
    await expect(service.sendMagicLink('me@example.com')).rejects.toMatchObject({ status: 429 });
  });

  it('signs in with the emailed code, and throws on a wrong one', async () => {
    const ok = setup();
    await ok.service.verifyCode('me@example.com', '12345678');
    expect(ok.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      token: '12345678',
      type: 'email',
    });
    expect(ok.service.isSignedIn()).toBe(true);

    TestBed.resetTestingModule();
    const wrong = setup({ verifyError: { message: 'Token has expired or is invalid' } });
    await expect(wrong.service.verifyCode('me@example.com', '00000000')).rejects.toMatchObject({
      message: 'Token has expired or is invalid',
    });
    expect(wrong.service.isSignedIn()).toBe(false);
  });

  it('signs out and goes to the login page', async () => {
    const { service, auth, navigateByUrl } = setup({ stored: session });
    await service.ready;
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(service.session()).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
