import { computed, signal } from '@angular/core';
import { FormErrors } from '../format/validation';

/**
 * State for an add/edit dialog: the form as typed text, field errors and the save state.
 * Pages own one per dialog and bind it to `app-edit-dialog`.
 */
export class DialogForm<F extends object> {
  readonly open = signal(false);
  /** Id of the row being edited, or null when adding. */
  readonly editingId = signal<string | null>(null);
  readonly form = signal<F>({} as F);
  readonly errors = signal<FormErrors<F>>({});
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = computed(() => this.editingId() !== null);

  show(form: F, editingId: string | null = null): void {
    this.form.set(form);
    this.editingId.set(editingId);
    this.errors.set({});
    this.error.set(null);
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  set<K extends keyof F>(key: K, value: F[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /**
   * Validates, then runs the write. Closes the dialog on success; otherwise shows field
   * errors or the write's message.
   */
  async submit<V>(
    validate: (form: F) => { errors: FormErrors<F>; value: V | null },
    write: (value: V, id: string | null) => Promise<string | null>,
  ): Promise<void> {
    const { errors, value } = validate(this.form());
    this.errors.set(errors);
    if (value === null) return;
    await this.run(() => write(value, this.editingId()));
  }

  /** Runs a write with busy/error state and closes on success. */
  async run(write: () => Promise<string | null>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const error = await write();
    this.busy.set(false);
    if (error) this.error.set(error);
    else this.close();
  }
}
