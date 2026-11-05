import { Pipe, PipeTransform } from '@angular/core';
import { Currency, MoneyFormatOptions, formatMoney, formatPercent } from '../format/money';

/**
 * `{{ value | money }}`, `{{ value | money: 'USD' }}`, `{{ pl | money: 'INR' : { sign: true } }}`
 * Impure so it re-runs when privacy mode flips; it is cheap and lists are a few dozen rows.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    currency: Currency = 'INR',
    options?: MoneyFormatOptions,
  ): string {
    return formatMoney(value, currency, options);
  }
}

/** `{{ plPercent | percent2 }}` → +12.34% */
@Pipe({ name: 'percent2' })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 2): string {
    return formatPercent(value, digits);
  }
}
