import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PORTFOLIO_NAME_MAX, PortfolioService } from '../../core/data/portfolio.service';

/** First run: shown instead of any page until the owner has at least one portfolio. */
@Component({
  selector: 'app-welcome',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card welcome">
      <i class="pi pi-sparkles welcome-icon" aria-hidden="true"></i>
      <h2 class="welcome-title">Create your first portfolio</h2>
      <p class="welcome-text">
        A portfolio is a label for whose money it is, for example "Me" or "Wife". You can add more,
        rename or reorder them later in Settings.
      </p>
      <form class="welcome-form" [formGroup]="form" (ngSubmit)="create()" novalidate>
        <label for="portfolio-name" class="field-label">Portfolio name</label>
        <input
          pInputText
          id="portfolio-name"
          [formControl]="name"
          [maxlength]="maxLength"
          autocomplete="off"
          [attr.aria-invalid]="!!error()"
          aria-describedby="portfolio-name-error"
        />
        @if (error(); as message) {
          <small id="portfolio-name-error" class="app-down">{{ message }}</small>
        }
        <button pButton type="submit" [disabled]="saving()">
          {{ saving() ? 'Creating…' : 'Create portfolio' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    .welcome {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 480px;
      margin: 24px auto 0;
    }
    .welcome-icon {
      font-size: 1.75rem;
      color: var(--p-primary-color);
    }
    .welcome-title {
      margin: 0;
      font-size: 24px;
      font-weight: 400;
      letter-spacing: -0.01em;
    }
    .welcome-text {
      margin: 0;
      color: var(--app-text-body);
    }
    .welcome-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .field-label {
      font-size: 14px;
      font-weight: 600;
    }
  `,
})
export class Welcome {
  private readonly portfolios = inject(PortfolioService);

  protected readonly maxLength = PORTFOLIO_NAME_MAX;
  protected readonly name = new FormControl('Me', { nonNullable: true });
  protected readonly form = new FormGroup({ name: this.name });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async create(): Promise<void> {
    this.saving.set(true);
    this.error.set(await this.portfolios.create(this.name.value));
    this.saving.set(false);
  }
}
