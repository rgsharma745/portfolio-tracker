# UI specification (responsive: desktop and mobile)

## Principles
- Mobile first, designed at 390x844, scaled up to 1440x900 and beyond.
- Numbers are the hero: large, tabular figures (`font-variant-numeric: tabular-nums`), INR in `en-IN` grouping (₹56,74,412), gains green with `+`, losses red with `-`.
- Calm and dense on desktop, airy and thumb-friendly on mobile.
- Light and dark themes, both AA contrast.

## Breakpoints and layout
| Viewport | Navigation | Holdings display | Dialogs |
|---|---|---|---|
| < 768px (mobile) | Bottom tab bar: Overview, MF, Stocks, More (RSU, Savings, Cards, Settings) | Card list (one card per holding) | Full-screen sheet |
| 768-1023px (tablet) | Collapsible left rail (icons) | Table with sticky first column | Centered dialog |
| >= 1024px (desktop) | Left sidebar with labels | Full PrimeNG table: sort, filter, totals footer | Centered dialog |
- Max content width 1200px, centered. Page padding 16px mobile, 24px desktop.
- Respect safe-area insets (`env(safe-area-inset-*)`) for the bottom bar and top bar.
- No horizontal page scroll anywhere. Wide tables scroll inside their own container.
- Touch targets at least 44x44px on mobile.

## Shared components
- `StatCard` (label, value, optional delta with color and sign)
- `MoneyText` (INR/USD, optional compact mode on mobile for lakhs/crores, e.g. ₹56.7L; full value on tap or on desktop)
- `HoldingCard` (mobile list item: name, current value, P&L and %, today, tap to open details/edit)
- `DataTable` wrapper around PrimeNG Table with a responsive switch (table on >= 768px, card list below)
- `PortfolioSwitcher` (All, then one entry per active portfolio; segmented control or dropdown on desktop, a chip row or bottom sheet on mobile; persisted in settings; default All)
- `PageHeader` (title, last-updated time, refresh button)
- States: skeleton loading, empty state with a call to action, error state with retry
- Privacy toggle in the top bar: masks all money with ••••

## Pages

### Login
Email magic link (and Google if enabled). Single centered card. No sign-up link.

### Overview
- Respects the portfolio switcher; default is the **family total (All)**.
- Stat cards (2 columns on mobile, 4 on desktop): Mutual funds (value + today), Stocks (value + today), RSU (vested value), Savings, Card dues (red if > 0), Combined (MF + Stocks) with today.
- Allocation donut (MF, Stocks, RSU vested, Savings).
- History line chart from `portfolio_snapshots` with range chips: 1M, 6M, 1Y, All.
- Summary table with one row per portfolio plus a family total row (Holdings, Invested, Current, P&L, Today). On mobile, becomes stacked rows.

### Mutual Funds
- Uses the portfolio switcher. In All mode each holding shows a small portfolio tag, and the same fund held in two portfolios appears as two rows (a "merge by fund" toggle is optional).
- Header stats: Current value, Invested, Total P&L (value and %), Today.
- Search box, sort (name, current value, P&L, P&L %, today), optional filter chips (Gainers, Losers).
- Desktop table columns: Fund, Units, Invested, NAV, NAV date, Current value, P&L, P&L %, Today; totals footer.
- Mobile card: fund name (2 lines max), current value, P&L and %, today, NAV date.
- Stale NAV badge when the NAV date is older than 4 days.
- Add / edit / delete holding (portfolio, units, invested, folio) with validation (positive numbers). Delete requires confirmation.
- Export CSV.

### Stocks
- Tabs: India, US (US values shown in USD with INR equivalent; toggle to show everything in INR).
- Same stats, search, sort, table/card behavior as Mutual Funds.
- Add / edit / delete holding (symbol, quantity, invested or avg price).

### RSU
- Stat cards: Total value after tax (INR), Total value USD (pre-tax), after-tax USD, Vested value (INR), Current price (USD).
- Unit cards: Total units, Vested, Sellable, Pending vesting, Sold for tax.
- Grants table (cards on mobile) with edit.
- Read-only formulas: derived from `DATA_MODEL.md`.

### Savings
- Total card, accounts count, largest account.
- List sorted by balance with a share-of-total bar. Tap a balance to edit inline (dialog on mobile). Add / delete account.

### Cards (monthly bill management)
- Month selector at the top (previous / next, defaults to the current month).
- Summary cards: Total pending (red if > 0), Awaiting statement (count), Next due (card name and "in N days" / "today" / "tomorrow" / "overdue"; red if within 3 days or overdue; "All clear" in green if nothing is pending).
- **This month's bills:** one row/card per card showing amount, due date and a status chip (awaiting, unpaid, partial, paid, overdue). Primary action per bill: **Mark paid** (sets paid amount = amount, paid on = today). Secondary actions: record a partial payment, enter or edit the amount, edit the due date, add a note.
- **Earlier unpaid bills:** a section above the month list showing unpaid or overdue bills from previous months so nothing is forgotten.
- **Create this month's bills** button: adds a bill with no amount for every active card that doesn't have one yet (due date computed from the card's days).
- Manage cards (a dialog or sub-page): add, edit bill day and due day, assign portfolio, deactivate.
- Mobile: bills as cards with a large Mark paid button; desktop: table with the same actions in a row menu.
- Sorted: overdue first, then by due date; paid bills last.

### Settings
Manage portfolios (add, rename, reorder, deactivate; delete only with a strong warning because it removes that portfolio's holdings), theme (system/light/dark), manual price override for a stock or the USD/INR rate, last job runs (NAV, prices, backup, with status and time), export all data as JSON, sign out.

## Interaction details
- Pull-to-refresh behavior on mobile is replaced by a visible Refresh button (re-queries Supabase).
- Optimistic UI is not required; show a saving state then refresh the row.
- Form validation messages inline; number inputs use `inputmode="decimal"`.
- All icon-only buttons have `aria-label`.

## Visual style
- PrimeNG Aura preset; primary color a calm blue; success green and danger red from theme tokens.
- Cards: 12px radius, 1px border, subtle shadow in light theme only.
- Typography: system UI font stack; numbers use tabular figures.
- Charts use theme CSS variables so they follow dark mode.

## Responsive test matrix (Playwright)
Run every page at 360x740, 390x844, 768x1024, 1024x768, 1440x900. Assert: no horizontal page scroll, bottom nav visible only below 768px, sidebar visible only at 1024px and above, primary stat cards visible without scrolling on the Overview page at 390x844.
