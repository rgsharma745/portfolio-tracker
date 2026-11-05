import { signal } from '@angular/core';

const STORAGE_KEY = 'pt.hideAmounts';
export const MASK = '••••';

/**
 * Privacy mode: when true, `formatMoney` prints •••• instead of amounts, everywhere.
 * A plain signal rather than a service so the pure formatters can read it; templates and
 * computeds that format money track it and update when it flips.
 */
export const amountsHidden = signal(readStored());

export function setAmountsHidden(hidden: boolean): void {
  amountsHidden.set(hidden);
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this session only.
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
