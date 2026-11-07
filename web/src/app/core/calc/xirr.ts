import { daysBetween } from './common';

/**
 * XIRR: the yearly rate r at which the cash flows' present value is zero,
 * Σ amount / (1 + r)^(days from the first flow / 365) = 0 (Actual/365, as Excel's XIRR).
 * Money paid in is negative, money out (or the current value) positive.
 * See docs/DATA_MODEL.md ("XIRR").
 */

export interface CashFlow {
  /** `YYYY-MM-DD`. */
  date: string;
  amount: number;
}

const TOLERANCE = 1e-7;
const MAX_NEWTON = 50;
const MAX_BISECTION = 200;
/** The bisection bracket: −99% to +1000% a year. */
const LOW = -0.99;
const HIGH = 10;

/**
 * The XIRR of `flows` as a fraction (0.12 is 12% a year), or null when it has no answer:
 * fewer than two flows, no money both in and out, every flow on one day, or no rate in
 * −99% to +1000% a year.
 */
export function xirr(flows: readonly CashFlow[]): number | null {
  const live = flows.filter((f) => f.amount !== 0);
  if (live.length < 2) return null;
  if (!live.some((f) => f.amount > 0) || !live.some((f) => f.amount < 0)) return null;

  const first = live.reduce((min, f) => (f.date < min ? f.date : min), live[0].date);
  const terms = live.map((f) => ({ t: daysBetween(first, f.date) / 365, amount: f.amount }));
  if (terms.every((x) => x.t === 0)) return null;

  const npv = (r: number) => terms.reduce((s, x) => s + x.amount / Math.pow(1 + r, x.t), 0);
  const slope = (r: number) =>
    terms.reduce((s, x) => s - (x.t * x.amount) / Math.pow(1 + r, x.t + 1), 0);

  return newton(npv, slope) ?? bisect(npv);
}

function newton(f: (r: number) => number, df: (r: number) => number): number | null {
  let r = 0.1;
  for (let i = 0; i < MAX_NEWTON; i++) {
    const d = df(r);
    if (!Number.isFinite(d) || d === 0) return null;
    const next = r - f(r) / d;
    if (!Number.isFinite(next) || next <= -1) return null;
    if (Math.abs(next - r) < TOLERANCE) return next >= LOW && next <= HIGH ? next : null;
    r = next;
  }
  return null;
}

function bisect(f: (r: number) => number): number | null {
  let lo = LOW;
  let hi = HIGH;
  let fLo = f(lo);
  if (fLo === 0) return lo;
  if (Math.sign(fLo) === Math.sign(f(hi))) return null;
  for (let i = 0; i < MAX_BISECTION; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === 0 || hi - lo < TOLERANCE) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
