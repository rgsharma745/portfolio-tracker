import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { PageTitleStrategy } from './core/page-title.strategy';
import { providePrimeTheme } from './core/theme/theme.config';
import { AppUpdateService } from './core/pwa/app-update.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: PageTitleStrategy },
    providePrimeTheme(),
    // Caches the app's own files only (ngsw-config.json has no data groups), so Supabase
    // responses always come from the network.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      inject(ThemeService);
      inject(AppUpdateService).start();
    }),
  ],
};
