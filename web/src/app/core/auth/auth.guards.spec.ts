import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  function setup(signedIn: boolean): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), isSignedIn: signal(signedIn) },
        },
      ],
    });
  }

  const run = (guard: typeof authGuard, url = '/overview') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  it('authGuard lets a signed-in user through', async () => {
    setup(true);
    expect(await run(authGuard)).toBe(true);
  });

  it('authGuard sends a signed-out user to /login', async () => {
    setup(false);
    expect(String(await run(authGuard))).toBe('/login');
  });

  it('authGuard strips the used magic-link code but keeps other params', async () => {
    setup(true);
    expect(String(await run(authGuard, '/overview?code=abc&tab=us'))).toBe('/overview?tab=us');
  });

  it('guestGuard sends a signed-in user to the app', async () => {
    setup(true);
    expect(String(await run(guestGuard))).toBe('/');
  });

  it('guestGuard shows the login page to a signed-out user', async () => {
    setup(false);
    expect(await run(guestGuard)).toBe(true);
  });
});
