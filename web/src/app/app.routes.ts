import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { LoginPage } from './features/login/login-page';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    // Eager: a signed-out first visit then needs no second round trip before it can paint.
    component: LoginPage,
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview',
        loadComponent: () =>
          import('./features/overview/overview-page').then((m) => m.OverviewPage),
      },
      {
        path: 'mutual-funds',
        title: 'Mutual funds',
        loadComponent: () => import('./features/mutual-funds/mf-page').then((m) => m.MfPage),
      },
      {
        path: 'stocks',
        title: 'Stocks',
        loadComponent: () => import('./features/stocks/stocks-page').then((m) => m.StocksPage),
      },
      {
        path: 'rsu',
        title: 'RSU',
        loadComponent: () => import('./features/rsu/rsu-page').then((m) => m.RsuPage),
      },
      {
        path: 'savings',
        title: 'Savings',
        loadComponent: () => import('./features/savings/savings-page').then((m) => m.SavingsPage),
      },
      {
        path: 'pf',
        title: 'Provident fund',
        loadComponent: () => import('./features/pf/pf-page').then((m) => m.PfPage),
      },
      {
        path: 'ppf',
        title: 'PPF',
        loadComponent: () => import('./features/ppf/ppf-page').then((m) => m.PpfPage),
      },
      {
        path: 'nps',
        title: 'NPS',
        loadComponent: () => import('./features/nps/nps-page').then((m) => m.NpsPage),
      },
      {
        path: 'cards',
        title: 'Credit cards',
        loadComponent: () => import('./features/cards/cards-page').then((m) => m.CardsPage),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
