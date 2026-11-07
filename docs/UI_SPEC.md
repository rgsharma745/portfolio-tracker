# UI specification (responsive: desktop and mobile)

## Principles
- Mobile first, designed at 390x844, scaled up to 1440x900 and beyond.
- Numbers are the hero: large, tabular figures (`font-variant-numeric: tabular-nums`), INR in `en-IN` grouping (₹56,74,412), gains green with `+`, losses red with `-`.
- Calm and dense on desktop, airy and thumb-friendly on mobile.
- Light and dark themes, both AA contrast (checked by axe-core in `e2e/accessibility.spec.ts`). Light muted text is `#6b717c` and gain green `#077a4a` so they pass on white and the grey bands; unselected select-button segments use surface 600. Dialogs return focus to the control that opened them.

## Breakpoints and layout
| Viewport | Navigation | Holdings display | Dialogs |
|---|---|---|---|
| < 768px (mobile) | Bottom tab bar: Overview, MF, Stocks, More (a bottom sheet sized to its content: RSU, Savings, PF, Cards, Settings as icon tiles in three columns, the current page highlighted, then Sign out on its own row) | Card list (one card per holding) | Full-screen sheet |
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
- `DataTable` wrapper around PrimeNG Table with a responsive switch (table on >= 768px, card list below). Sorting is owned by the page (header sort buttons and the mobile sort menu share one state); PrimeNG's own sorting is not used.
- `PortfolioSwitcher` (All, then one entry per active portfolio; segmented control or dropdown on desktop, a chip row or bottom sheet on mobile; persisted in settings; default All)
- `PageHeader` (title, last-updated time, refresh button)
- States: skeleton loading, empty state with a call to action, error state with retry
- Privacy toggle in the top bar: masks all money with •••• (eye button; remembered on this device). Percentages, units and names stay visible; the chart hides its money axis; CSV export keeps real values. Amounts typed into an edit form are not masked

## Pages

### Login
Email magic link (and Google if enabled). Single centered card. No sign-up link.

### Overview
- Respects the portfolio switcher; default is the **family total (All)**.
- Stat cards: Combined (MF + Stocks) with today first, then Mutual funds (value + today), Stocks (value + today), RSU (vested value), Savings, PF (balance), Card dues (red if > 0). Mobile: 2 columns with Combined full width; from 1024px: 4 columns with Combined spanning two, so the seven cards make two full rows.
- Allocation (MF, Stocks, RSU vested, Savings, PF) as a tall segmented bar with each share printed inside, plus a legend listing every part's amount and share (which doubles as the table view). A bar reads more accurately than a donut for one whole split into a few parts.
- History line chart from `portfolio_snapshots` with range chips: 1M, 6M, 1Y, All, and a switch between MF + stocks and the PF balance (the PF line starts at its first day above zero).
- Summary table with one row per portfolio plus a family total row (Holdings, Invested, Current, P&L, Today). On mobile, becomes stacked rows.

### Mutual Funds
- Uses the portfolio switcher. In All mode each holding shows a small portfolio tag, and the same fund held in two portfolios appears as two rows (a "merge by fund" toggle is optional).
- Header stats: Current value, Invested, Total P&L (value and %), Today.
- Search box, sort (name, current value, P&L, P&L %, today), optional filter chips (Gainers, Losers).
- Desktop table (clean list rows): Fund with a details line under it (units · NAV and NAV date · portfolio and stale tags), Value with the amount invested under it, P&L with P&L % under it, Today; a totals bar at the bottom. Units, NAV and invested are not separate columns (CSV export still has them). A soft header band, roomy rows and row hover come from the PrimeNG preset (`core/theme/preset.ts`). Stocks use the same layout (quantity, average price and price in the details line; ≈ INR under a USD value).
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

### Provident fund
- Stat cards: PF balance (employee + employer + interest), Employee, Employer, Interest, Pension (EPS) marked "Not in the PF balance". Mobile: 2 columns with the balance full width; from 1024px: one row of five.
- By company: one line per company (and portfolio in All mode) with its balance, pension and last wage month, and an **Add next month** button (the wage month after the last contribution, credited a month later, same amounts). Header actions: New company, Add interest, and Add next month (for the most recent company) when there is more than one company.
- Passbook: filters for company and financial year (of the transaction date); desktop table (Credited date, Wage month or an "Interest FY …" tag, Company, Employee, Employer, Pension) sorted by credited date, newest first, with header sorting and a totals row; mobile cards (wage month or Interest · company, the credited date, then the amounts). Tap or the pencil edits; delete from the dialog with confirmation.
- Dialog: Type (Monthly / Interest; switching type never carries amounts over: Interest starts empty and credited today, Monthly refills the company's next wage month), Portfolio, Company (suggests known companies; picking one while adding refills its next month), Wage month (Jan…Dec) and Wage year selects for monthly rows only, Transaction date (for interest, a hint names the financial year it counts for), Employee, Employer, and Pension for monthly rows (empty = 0).

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
Manage portfolios (add, rename, reorder, deactivate; delete only with a strong warning because it removes that portfolio's holdings), theme (system/light/dark), manual price override for a stock or the USD/INR rate, last job runs (NAV, prices, backup, with status and time), and a Run now button for NAVs and prices (disabled for 30 minutes after a run, showing "Available again at …"; the result, a link to the GitHub run or the reason it did not start appears under the row as a status message), export all data as JSON, sign out.

## Interaction details
- Pull-to-refresh behavior on mobile is replaced by a visible Refresh button (re-queries Supabase).
- Data also re-queries by itself: on returning to the tab or app when it is over a minute old, and every 5 minutes while the app is visible (picks up job runs and edits made elsewhere). No Realtime subscriptions.
- Optimistic UI is not required; show a saving state then refresh the row.
- Form validation messages inline; number inputs use `inputmode="decimal"`.
- All icon-only buttons have `aria-label`.

## Visual style
A calm, institutional finance look. Layout and density follow this spec; the look comes from a custom Aura preset (`web/src/app/core/theme/preset.ts`) and app tokens (`web/src/styles.scss`). Use tokens, never inline hex.
- **One action color:** blue `#0052ff` (primary 500), pressed `#003ecc` (600). Use it sparingly: primary buttons, active nav item, links. No second brand color.
- **Surfaces (neutral palette):** canvas `#ffffff`, soft band `#f7f7f7`, strong fill `#eef0f3`, hairline `#dee1e6`; dark theme canvas `#0a0b0d`, elevated `#16181c`.
- **Text:** ink `#0a0b0d`, body `#5b616e`, muted `#7c828a` (light theme); inverted in dark.
- **Gain/loss:** text color only, never a background, always with a `+`/`-` sign. Light: up `#098551`, down `#cf202f`. Dark: up `#3cc68a`, down `#f0616d`. All pass AA.
- **Typography:** Inter (self-hosted, variable) for UI; headings at weight 400 with slight negative tracking, labels and buttons at 600. Every money and unit figure uses JetBrains Mono with tabular figures (`.app-num`).
- **Shape:** buttons, chips and badges are pills; cards use 24px radius (`xl`), inputs 12px (`md`), compact rows 8px (`sm`). No sharp corners.
- **Depth:** mostly flat; cards get a 1px hairline border. A single soft shadow (`0 4px 12px rgba(0,0,0,.04)`) only on hover, light theme only.
- **Spacing:** 4px base unit (4, 8, 12, 16, 20, 24, 32, 48). Dense on desktop: no marketing-style 96px bands inside the app.
- Charts (Chart.js via the shared `app-line-chart` component) use theme CSS variables so they follow dark mode. Series colors are `--app-series-1..5` in a fixed order (blue, orange, aqua, yellow, purple; light and dark steps; purple is PF and carries white labels at 5.8:1), checked for colour-blind separation; a part keeps its color whatever else is shown. The two lighter light-mode colours are below 3:1 contrast, so every chart that uses them prints labels or a legend with values.

## Responsive test matrix (Playwright)
Run every page at 360x740, 390x844, 768x1024, 1024x768, 1440x900. Assert: no horizontal page scroll, bottom nav visible only below 768px, sidebar visible only at 1024px and above, primary stat cards visible without scrolling on the Overview page at 390x844.
