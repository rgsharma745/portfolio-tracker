import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';

let nextId = 0;

/**
 * Add/edit dialog chrome shared by every feature: the form fields are projected, and the
 * footer has Save, Cancel and (when editing) Delete with a confirmation step. Full-screen
 * sheet on mobile (`.app-dialog`).
 */
@Component({
  selector: 'app-edit-dialog',
  imports: [FormsModule, ButtonModule, DialogModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="$event || closed.emit()"
      [modal]="true"
      [draggable]="false"
      [header]="header()"
      closeAriaLabel="Close"
      styleClass="app-dialog"
      (onHide)="restoreFocus()"
    >
      <form [id]="formId" class="form-grid" (ngSubmit)="save.emit()" novalidate>
        <ng-content />
        @if (error(); as message) {
          <p-message severity="error">{{ message }}</p-message>
        }
      </form>
      <ng-template #footer>
        @if (confirming()) {
          <div class="dialog-actions" role="group" aria-label="Confirm delete">
            <span class="confirm-text">{{ deleteQuestion() }}</span>
            <button
              pButton
              type="button"
              severity="secondary"
              [disabled]="busy()"
              (click)="confirming.set(false)"
            >
              Keep
            </button>
            <button
              pButton
              type="button"
              severity="danger"
              [disabled]="busy()"
              (click)="remove.emit()"
            >
              Delete
            </button>
          </div>
        } @else {
          <div class="dialog-actions">
            @if (canDelete()) {
              <button
                pButton
                type="button"
                text
                severity="danger"
                class="delete"
                [disabled]="busy()"
                (click)="confirming.set(true)"
              >
                <i class="pi pi-trash" aria-hidden="true"></i>
                Delete
              </button>
            }
            <button pButton type="button" severity="secondary" (click)="closed.emit()">
              Cancel
            </button>
            <button pButton type="submit" [attr.form]="formId" [disabled]="busy()">
              {{ busy() ? 'Saving…' : saveLabel() }}
            </button>
          </div>
        }
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .dialog-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      width: 100%;
    }
    .delete {
      margin-right: auto;
    }
    .confirm-text {
      margin-right: auto;
      font-weight: 600;
    }
  `,
})
export class EditDialog {
  readonly visible = input.required<boolean>();
  readonly header = input.required<string>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  /** Show Delete (when editing an existing row). */
  readonly canDelete = input(false);
  readonly deleteQuestion = input('Delete this permanently?');
  readonly saveLabel = input('Save');

  readonly save = output();
  readonly remove = output();
  readonly closed = output();

  protected readonly formId = `edit-form-${nextId++}`;
  protected readonly confirming = signal(false);

  private readonly document = inject(DOCUMENT);
  /** The control that opened the dialog, focused again when it closes (WCAG 2.4.3). */
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      // Runs before the dialog renders and moves focus inside it.
      const active = this.document.activeElement;
      this.opener = active instanceof HTMLElement && active !== this.document.body ? active : null;
      // Each opening starts without a pending delete confirmation.
      this.confirming.set(false);
    });
  }

  protected restoreFocus(): void {
    // After a delete the opener (an Edit button in that row) may be gone.
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }
}
