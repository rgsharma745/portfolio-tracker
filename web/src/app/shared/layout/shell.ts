import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, TitleStrategy } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshService } from '../../core/data/refresh.service';
import { PageTitleStrategy } from '../../core/page-title.strategy';
import { ThemeService } from '../../core/theme/theme.service';
import { NAV_ITEMS } from './nav-items';
import { PortfolioSwitcher } from './portfolio-switcher';

/**
 * Responsive app frame: left sidebar from 1024px, icon rail from 768px,
 * bottom tab bar plus a "More" sheet below 768px.
 */
@Component({
  selector: 'app-shell',
  imports: [
    DatePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    DrawerModule,
    PortfolioSwitcher,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly refresher = inject(RefreshService);
  protected readonly title = (inject(TitleStrategy) as PageTitleStrategy).current;

  protected readonly navItems = NAV_ITEMS;
  protected readonly primaryItems = NAV_ITEMS.filter((item) => item.primary);
  protected readonly moreItems = NAV_ITEMS.filter((item) => !item.primary);
  protected readonly moreOpen = signal(false);
  /** PrimeNG renders the drawer as an <aside>; expose it as the modal dialog it is. */
  protected readonly sheetPt = {
    root: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'More' },
  };

  protected signOut(): void {
    this.moreOpen.set(false);
    void this.auth.signOut();
  }
}
