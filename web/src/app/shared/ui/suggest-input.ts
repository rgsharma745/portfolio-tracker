import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { matchSuggestions } from '../format/suggest';

/**
 * A free-text field that suggests values (PrimeNG AutoComplete, with a button that lists them
 * all). Used instead of a native `<datalist>`, which looks different in every browser.
 * Suggestions starting with the typed text come first, then those containing it.
 */
@Component({
  selector: 'app-suggest-input',
  imports: [FormsModule, AutoCompleteModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-autocomplete
      [inputId]="inputId()"
      autocomplete="off"
      [suggestions]="suggestions()"
      (completeMethod)="query.set($event.query)"
      [dropdown]="true"
      [dropdownAriaLabel]="dropdownLabel()"
      [showEmptyMessage]="false"
      [placeholder]="placeholder()"
      [ngModel]="value()"
      (ngModelChange)="valueChange.emit($event ?? '')"
      (onSelect)="committed.emit($event.value)"
      (onBlur)="committed.emit(value())"
      appendTo="body"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SuggestInput {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The input's id, for the field's `<label for>`. */
  readonly inputId = input.required<string>();
  readonly options = input<readonly string[]>([]);
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly dropdownLabel = input<string>('Show suggestions');

  /** Every change while typing or picking. */
  readonly valueChange = output<string>();
  /** A suggestion picked or the field left: the value is final (like a native `change`). */
  readonly committed = output<string>();

  protected readonly query = signal('');
  protected readonly suggestions = computed(() => matchSuggestions(this.options(), this.query()));

  constructor() {
    // AutoComplete has no maxlength input; set it on the rendered field.
    afterRenderEffect(() => {
      const max = this.maxLength();
      const field = this.host.nativeElement.querySelector('input');
      if (!field) return;
      if (max === null) field.removeAttribute('maxlength');
      else field.maxLength = max;
    });
  }
}
