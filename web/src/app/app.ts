import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AppUpdateService } from './core/pwa/app-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule],
  template: `
    <router-outlet />
    @if (update.ready()) {
      <div class="update-banner app-card" role="status">
        <span>A new version of the app is ready.</span>
        <button pButton type="button" size="small" (click)="update.reload()">Reload</button>
      </div>
    }
  `,
  styles: `
    .update-banner {
      position: fixed;
      z-index: 1100;
      top: calc(env(safe-area-inset-top) + 8px);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      width: max-content;
      max-width: calc(100vw - 32px);
      padding: 8px 8px 8px 16px;
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
      font-size: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly update = inject(AppUpdateService);
}
