import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/auth/auth.service';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Email magic-link sign-in. No sign-up: only the owner's account exists. */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="login">
      <section class="app-card login-card">
        <span class="brand-mark" aria-hidden="true">₹</span>
        <h1 class="login-title">Portfolio Tracker</h1>

        @if (status() === 'sent') {
          <div role="status" class="flex flex-col gap-2">
            <p class="login-text"><strong>Check your email.</strong></p>
            <p class="login-text">
              If {{ email.value }} is registered, a sign-in link is on its way. It works once and
              expires in an hour.
            </p>
            <button pButton type="button" text (click)="status.set('idle')">
              Use a different email
            </button>
          </div>
        } @else {
          <p class="login-text">Sign in with a one-time link sent to your email.</p>
          <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <label for="email" class="field-label">Email</label>
            <input
              pInputText
              id="email"
              type="email"
              autocomplete="email"
              inputmode="email"
              [formControl]="email"
              [attr.aria-invalid]="showInvalid()"
              aria-describedby="email-error"
            />
            @if (showInvalid()) {
              <small id="email-error" class="app-down">Enter a valid email address.</small>
            }
            @if (status() === 'error') {
              <p-message severity="error"
                >Could not send the link. Try again in a minute.</p-message
              >
            }
            <button pButton type="submit" [disabled]="status() === 'sending'">
              {{ status() === 'sending' ? 'Sending…' : 'Email me a sign-in link' }}
            </button>
          </form>
        }
      </section>
    </main>
  `,
  styles: `
    .login {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: 16px;
    }
    .login-card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      max-width: 400px;
      padding: 32px 24px;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 9999px;
      background: var(--p-primary-color);
      color: var(--p-primary-contrast-color);
      font-size: 20px;
      font-weight: 600;
    }
    .login-title {
      margin: 0;
      font-size: 28px;
      font-weight: 400;
      letter-spacing: -0.02em;
    }
    .login-text {
      margin: 0;
      color: var(--app-text-body);
    }
    .field-label {
      font-size: 14px;
      font-weight: 600;
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);

  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly form = new FormGroup({ email: this.email });
  protected readonly status = signal<Status>('idle');
  protected readonly submitted = signal(false);

  protected showInvalid(): boolean {
    return this.submitted() && this.email.invalid;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.email.invalid) return;
    this.status.set('sending');
    try {
      await this.auth.sendMagicLink(this.email.value.trim());
      this.status.set('sent');
    } catch {
      this.status.set('error');
    }
  }
}
