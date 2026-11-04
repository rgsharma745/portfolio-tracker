/** Field error messages for a form, keyed by field. */
export type FormErrors<F> = Partial<Record<keyof F, string>>;

/** Drops fields whose check passed (undefined), so an empty object means "valid". */
export function onlyErrors<F>(errors: Partial<Record<keyof F, string | undefined>>): FormErrors<F> {
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message),
  ) as FormErrors<F>;
}

/** Error text for a required number that must be zero or more, or undefined if valid. */
export function nonNegative(value: number | null, what: string): string | undefined {
  if (value === null) return `Enter ${what}.`;
  if (Number.isNaN(value)) return 'Enter a number, e.g. 1250.50.';
  if (value < 0) return 'Must be zero or more.';
  return undefined;
}

/** Like {@link nonNegative} but an empty field is allowed. */
export function optionalNonNegative(value: number | null): string | undefined {
  return value === null ? undefined : nonNegative(value, '');
}
