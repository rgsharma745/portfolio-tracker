import { FdView, fdView } from '../../core/calc/fd';
import type { FixedDeposit } from '../../core/data/fd.service';
import { formatDate } from '../../shared/format/number';
import { durationText } from './fd-form';

/** One FD as the page shows it (fd-page.html). */
export interface FdCard {
  fd: FixedDeposit;
  view: FdView;
  portfolio: string;
  startLabel: string;
  maturityLabel: string;
  rateText: string;
  /** "183 days left", "1 day left", "Matured 12 Oct 2026". */
  daysText: string;
  /** "About 6 months", shown under the days for terms of 60 days or more. */
  daysHint: string;
}

/** "7.25%": up to 3 decimals, no sign. */
export function rateText(rate: number): string {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(rate)}%`;
}

function daysText(view: FdView, maturityLabel: string): string {
  if (!view.matured) return `${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left`;
  return `Matured ${maturityLabel}`;
}

/**
 * The FDs in the selected portfolios, split into running ones (soonest maturity first) and
 * matured ones (most recently matured first). `names` maps portfolio ids to names.
 */
export function fdCards(
  deposits: readonly FixedDeposit[],
  scopeIds: readonly string[],
  names: ReadonlyMap<string, string>,
  today: string,
): { active: FdCard[]; matured: FdCard[] } {
  const ids = new Set(scopeIds);
  const cards = deposits
    .filter((fd) => ids.has(fd.portfolio_id))
    .map((fd): FdCard => {
      const view = fdView(fd, today);
      const maturityLabel = formatDate(fd.maturity_date);
      return {
        fd,
        view,
        portfolio: names.get(fd.portfolio_id) ?? '',
        startLabel: formatDate(fd.start_date),
        maturityLabel,
        rateText: rateText(fd.rate),
        daysText: daysText(view, maturityLabel),
        daysHint:
          !view.matured && view.daysLeft >= 60 ? `About ${durationText(view.daysLeft)}` : '',
      };
    });
  const byMaturity = (a: FdCard, b: FdCard) => a.fd.maturity_date.localeCompare(b.fd.maturity_date);
  return {
    active: cards.filter((c) => !c.view.matured).sort(byMaturity),
    matured: cards.filter((c) => c.view.matured).sort((a, b) => byMaturity(b, a)),
  };
}

/** The "Next maturity" card's note: "SBI · 12 days left", or why there is none. */
export function nextMaturityNote(next: FdCard | null, maturedCount: number): string {
  if (next) return `${next.fd.bank} · ${next.daysText}`;
  return maturedCount ? 'Every FD has matured' : '';
}
