import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// inject() must run before the first await: after it, the injection context is gone.

/**
 * Every app page: signed-in only. After a magic-link sign-in, supabase-js has already
 * exchanged the one-time `?code=` for a session; drop it from the address bar and history.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.isSignedIn()) return router.createUrlTree(['/login']);

  const url = router.parseUrl(state.url);
  if ('code' in url.queryParams) {
    delete url.queryParams['code'];
    return url;
  }
  return true;
};

/** Login page: send signed-in users to the app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return !auth.isSignedIn() || router.createUrlTree(['/']);
};
