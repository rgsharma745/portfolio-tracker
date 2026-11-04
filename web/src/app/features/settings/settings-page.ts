import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { DataCheckSection } from './data-check-section';
import { PortfoliosSection } from './portfolios-section';

/** Settings: portfolios, data check, theme and account (price overrides etc. in Phase 6). */
@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, ButtonModule, SelectButtonModule, PortfoliosSection, DataCheckSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <app-portfolios-section />
      <app-data-check-section />
      <section class="app-card flex flex-col gap-3">
        <h2 class="section-title" id="theme-label">Theme</h2>
        <p-selectbutton
          [options]="themeOptions"
          optionLabel="label"
          optionValue="value"
          [ngModel]="theme.mode()"
          (ngModelChange)="theme.setMode($event)"
          [allowEmpty]="false"
          ariaLabelledBy="theme-label"
        />
      </section>
      <section class="app-card flex flex-col gap-3">
        <h2 class="section-title">Account</h2>
        <p class="m-0 text-sm">Signed in as {{ auth.user()?.email }}</p>
        <div>
          <button pButton type="button" severity="secondary" (click)="auth.signOut()">
            <i class="pi pi-sign-out" aria-hidden="true"></i>
            Sign out
          </button>
        </div>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions: { label: string; value: ThemeMode }[] = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ];
}
