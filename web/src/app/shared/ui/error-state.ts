import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-error-state',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card state" role="alert">
      <i class="pi pi-exclamation-triangle state-icon app-down" aria-hidden="true"></i>
      <h2 class="state-title">{{ title() }}</h2>
      <p class="state-message">{{ message() }}</p>
      <button pButton type="button" severity="secondary" (click)="retry.emit()">Try again</button>
    </section>
  `,
  styleUrl: './state.scss',
})
export class ErrorState {
  readonly title = input('Something went wrong');
  readonly message = input('Check your connection and try again.');
  readonly retry = output();
}
