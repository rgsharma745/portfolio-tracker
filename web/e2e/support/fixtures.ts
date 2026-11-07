import {
  type APIRequestContext,
  type Locator,
  type Page,
  expect,
  request,
  type TestInfo,
} from '@playwright/test';
import { localSupabase } from './local-supabase';

export const OWNER_EMAIL = 'e2e-owner@example.com';
export const SIGNOUT_EMAIL = 'e2e-signout@example.com';
export const WELCOME_EMAIL = 'e2e-welcome@example.com';
export const SETTINGS_EMAIL = 'e2e-settings@example.com';
export const HOLDINGS_EMAIL = 'e2e-holdings@example.com';
export const PORTFOLIOS = ['Me', 'Wife'];

async function admin(): Promise<APIRequestContext> {
  const { apiUrl, serviceKey } = localSupabase();
  return request.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
}

/** Creates the user if missing (sign-up is disabled, so only the admin API can) and returns its id. */
export async function ensureUser(email: string): Promise<string> {
  const api = await admin();
  const created = await api.post('/auth/v1/admin/users', {
    data: { email, email_confirm: true },
  });
  if (created.ok()) return (await created.json()).id;
  const list = await api.get('/auth/v1/admin/users', { params: { per_page: 1000 } });
  const user = (await list.json()).users.find((u: { email: string }) => u.email === email);
  if (!user) throw new Error(`Could not create or find ${email}: ${await created.text()}`);
  return user.id;
}

/**
 * Resets a user's data to a known state: the given portfolios (deleting a portfolio
 * cascades to its holdings and cards) and no settings. Returns portfolio ids by name.
 */
export async function seedPortfolios(
  ownerId: string,
  names: string[],
  inactive: string[] = [],
): Promise<Record<string, string>> {
  const api = await admin();
  await api.delete('/rest/v1/settings', { params: { owner_id: `eq.${ownerId}` } });
  await api.delete('/rest/v1/portfolios', { params: { owner_id: `eq.${ownerId}` } });
  if (!names.length) return {};
  const rows = await adminInsert(
    'portfolios',
    names.map((name, i) => ({
      owner_id: ownerId,
      name,
      sort_order: i + 1,
      is_active: !inactive.includes(name),
    })),
  );
  return Object.fromEntries(rows.map((r) => [r['name'], r['id']]));
}

/** Inserts rows with the service role (bypasses RLS) and returns them. */
export async function adminInsert(
  table: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, string>[]> {
  return adminWrite(table, rows, 'return=representation');
}

/** Inserts or replaces rows by primary key (shared market data tables). */
export async function adminUpsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  await adminWrite(table, rows, 'resolution=merge-duplicates,return=representation');
}

async function adminWrite(
  table: string,
  rows: Record<string, unknown>[],
  prefer: string,
): Promise<Record<string, string>[]> {
  const api = await admin();
  // Rows may omit optional fields; `columns` lets the omitted ones take their defaults.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(',');
  const res = await api.post(`/rest/v1/${table}`, {
    params: { columns },
    data: rows,
    headers: { Prefer: prefer },
  });
  expect(res.ok(), `${table}: ${await res.text()}`).toBe(true);
  return res.json();
}

/** Deletes rows matching PostgREST filters with the service role. */
export async function adminDelete(table: string, filters: Record<string, string>): Promise<void> {
  const api = await admin();
  await api.delete(`/rest/v1/${table}`, { params: filters });
}

/** Signs in through the real flow: request a magic link, read it from Mailpit, open it. */
export async function signInWithMagicLink(page: Page, email: string): Promise<void> {
  const html = await requestSignInEmail(page, email);
  const link = (html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1] ?? '').replaceAll(
    '&amp;',
    '&',
  );
  expect(link, 'sign-in link in the email').not.toBe('');
  await page.goto(link);
  await expect(page).toHaveURL(/\/overview$/);
}

/** Asks for a sign-in email on /login and returns its HTML (link and code). */
export async function requestSignInEmail(page: Page, email: string): Promise<string> {
  const mail = await request.newContext({ baseURL: localSupabase().mailpitUrl });
  await mail.delete('/api/v1/messages', { data: {} });

  // Supabase sends one email per address per second, so back-to-back sign-ins can be
  // refused; retry on a freshly loaded page so the result is always the new attempt's.
  const sent = page.getByText('Check your email.');
  const refused = page.getByText('Could not send the link');
  for (let attempt = 0; ; attempt++) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(sent.or(refused)).toBeVisible();
    if (await sent.isVisible()) break;
    if (attempt === 2) throw new Error(`Supabase would not send a magic link to ${email}`);
    await page.waitForTimeout(1500);
  }

  let html = '';
  await expect
    .poll(
      async () => {
        const found = await mail.get('/api/v1/search', { params: { query: `to:${email}` } });
        const [message] = (await found.json()).messages ?? [];
        if (!message) return '';
        html = (await (await mail.get(`/api/v1/message/${message.ID}`)).json()).HTML;
        return html;
      },
      { message: 'sign-in email', timeout: 15_000 },
    )
    .not.toBe('');
  return html;
}

/** A stat card by its exact label. */
export function statCard(page: Page, label: string) {
  return page
    .locator('app-stat-card')
    .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
}

/** Saves a full-page screenshot under test-results/screens for visual review. */
export async function screenshot(page: Page, name: string, project: string): Promise<void> {
  // Let PrimeNG transitions (selected states, dialogs) settle first.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/screens/${name}-${project}.png`, fullPage: true });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Picks `iso` (YYYY-MM-DD) in a date field (`app-date-input`, PrimeNG DatePicker) the way a
 * phone user must: open the calendar, then year, month and day. Works on every project.
 */
export async function pickDate(page: Page, input: Locator, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number);
  await input.click();
  const panel = page.locator('.p-datepicker-panel');
  await expect(panel).toBeVisible();
  await panel.locator('.p-datepicker-select-year').click();
  // The year view shows a decade at a time: step to the one holding `year`
  const years = panel.locator('.p-datepicker-year-view .p-datepicker-year');
  await expect(years.first()).toBeVisible();
  // The selected cell repeats its text in a hidden span ("2026 2026"), so allow repeats.
  const exact = (text: string | number) => new RegExp(`^\\s*${text}(?:\\s+${text})?\\s*$`);
  for (let i = 0; i < 10 && !(await years.filter({ hasText: exact(year) }).count()); i++) {
    const first = Number((await years.first().textContent())?.trim());
    const before = await years.first().textContent();
    await panel.getByRole('button', { name: year < first ? /previous/i : /next/i }).click();
    await expect(years.first()).not.toHaveText(before ?? '');
  }
  await years.filter({ hasText: exact(year) }).click();
  const months = panel.locator('.p-datepicker-month-view .p-datepicker-month');
  await months.filter({ hasText: exact(MONTHS[month - 1]) }).click();
  await panel
    .locator('td:not(.p-datepicker-other-month) .p-datepicker-day')
    .filter({ hasText: exact(day) })
    .click();
  await expect(panel).toBeHidden();
}

/** Fails if the page scrolls horizontally. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal page overflow (px)').toBeLessThanOrEqual(0);
}

/** Phone-sized projects: Chrome at 390x844 and WebKit as an iPhone. */
export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mobile' || testInfo.project.name === 'iphone';
}
