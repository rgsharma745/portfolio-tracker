import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';

const comingSoon = () => import('./shared/ui/coming-soon-page').then((m) => m.ComingSoonPage);

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', title: 'Overview', loadComponent: comingSoon },
      {
        path: 'mutual-funds',
        title: 'Mutual funds',
        loadComponent: () => import('./features/mutual-funds/mf-page').then((m) => m.MfPage),
      },
      { path: 'stocks', title: 'Stocks', loadComponent: comingSoon },
      { path: 'rsu', title: 'RSU', loadComponent: comingSoon },
      { path: 'savings', title: 'Savings', loadComponent: comingSoon },
      { path: 'cards', title: 'Credit cards', loadComponent: comingSoon },
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
