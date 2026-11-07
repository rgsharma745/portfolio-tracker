import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { BreakpointService } from '../layout/breakpoint.service';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` to a local Date at midnight, or null if empty or not a date. */
export function isoToDate(iso: string | null | undefined): Date | null {
  const m = ISO_DATE.exec(iso ?? '');
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A Date's local calendar day as `YYYY-MM-DD` ('' for null): no time zone shifts. */
export function dateToIso(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A date field: PrimeNG DatePicker showing "7 Nov 2026", with the value kept as `YYYY-MM-DD`
 * text like the rest of the forms (and the database). One place to configure every date
 * field: calendar opens over the page, Today and Clear buttons, and on phones the text box
 * is read-only so the calendar opens instead of the keyboard.
 */
@Component({
  selector: 'app-date-input',
  imports: [FormsModule, DatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-datepicker
      [inputId]="inputId()"
      [ngModel]="date()"
      (ngModelChange)="value.set(toIso($event))"
      [ngModelOptions]="{ standalone: true }"
      dateFormat="d M yy"
      [showIcon]="true"
      iconDisplay="input"
      [showButtonBar]="true"
      [readonlyInput]="bp.isMobile()"
      [maxDate]="max()"
      [firstDayOfWeek]="1"
      appendTo="body"
      [fluid]="true"
      [pt]="pt()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class DateInput {
  protected readonly bp = inject(BreakpointService);

  /** The date as `YYYY-MM-DD`, or '' when empty. */
  readonly value = model('');
  /** Id of the text box, for the field's `<label for>`. */
  readonly inputId = input.required<string>();
  /** Latest date allowed, `YYYY-MM-DD`. */
  readonly maxDate = input<string | null>(null);
  /** Id of a help text describing the field. */
  readonly describedBy = input<string | null>(null);

  protected readonly date = computed(() => isoToDate(this.value()));
  protected readonly max = computed(() => isoToDate(this.maxDate()));
  /**
   * - the hint, when there is one, is announced with the text box;
   * - PrimeNG repeats `aria-selected` on the day's inner span, where it is not allowed (axe:
   *   aria-allowed-attr); the day's table cell already carries it.
   */
  protected readonly pt = computed(() => {
    const id = this.describedBy();
    return {
      day: { 'aria-selected': null },
      ...(id ? { pcInputText: { root: { 'aria-describedby': id } } } : {}),
    };
  });

  protected toIso(date: Date | null): string {
    return dateToIso(date);
  }
}
