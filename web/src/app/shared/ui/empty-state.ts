import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-empty-state',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card state">
      <i [class]="'pi ' + icon() + ' state-icon'" aria-hidden="true"></i>
      <h2 class="state-title">{{ title() }}</h2>
      @if (message()) {
        <p class="state-message">{{ message() }}</p>
      }
      @if (actionLabel()) {
        <button pButton type="button" (click)="action.emit()">{{ actionLabel() }}</button>
      }
    </section>
  `,
  styleUrl: './state.scss',
})
export class EmptyState {
  readonly icon = input('pi-inbox');
  readonly title = input.required<string>();
  readonly message = input('');
  readonly actionLabel = input('');
  readonly action = output();
}
