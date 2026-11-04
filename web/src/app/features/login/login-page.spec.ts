import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  async function submit(sendMagicLink: () => Promise<void>, email: string) {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [{ provide: AuthService, useValue: { sendMagicLink } }],
    });
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    return el;
  }

  it('confirms the link was sent', async () => {
    const el = await submit(() => Promise.resolve(), 'me@example.com');
    expect(el.textContent).toContain('Check your email.');
  });

  it('shows an error message when sending fails', async () => {
    const el = await submit(() => Promise.reject(new Error('boom')), 'me@example.com');
    expect(el.querySelector('p-message')?.textContent).toContain('Could not send the link');
  });

  it('validates the address before calling Supabase', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const el = await submit(send, 'nope');
    expect(el.textContent).toContain('Enter a valid email address.');
    expect(send).not.toHaveBeenCalled();
  });
});
