import { Directive, computed, input } from '@angular/core';

/** Colors gain/loss text: green when positive, red when negative, neutral at zero or missing. */
@Directive({
  selector: '[appPl]',
  host: {
    '[class.app-up]': 'tone() === "up"',
    '[class.app-down]': 'tone() === "down"',
  },
})
export class PlColorDirective {
  readonly appPl = input<number | null | undefined>();

  protected readonly tone = computed(() => {
    const v = this.appPl();
    if (v === null || v === undefined || v === 0 || Number.isNaN(v)) return 'neutral';
    return v > 0 ? 'up' : 'down';
  });
}
