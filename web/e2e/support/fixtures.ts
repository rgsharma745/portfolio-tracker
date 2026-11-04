import { type APIRequestContext, type Page, expect, request } from '@playwright/test';
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
  const mail = await request.newContext({ baseURL: localSupabase().mailpitUrl });
  await mail.delete('/api/v1/messages', { data: {} });

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email.')).toBeVisible();

  let link = '';
  await expect
    .poll(
      async () => {
        const found = await mail.get('/api/v1/search', { params: { query: `to:${email}` } });
        const [message] = (await found.json()).messages ?? [];
        if (!message) return '';
        const body = await (await mail.get(`/api/v1/message/${message.ID}`)).json();
        link = (body.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1] ?? '').replaceAll(
          '&amp;',
          '&',
        );
        return link;
      },
      { message: 'magic link email', timeout: 15_000 },
    )
    .not.toBe('');

  await page.goto(link);
  await expect(page).toHaveURL(/\/overview$/);
}

/** Saves a full-page screenshot under test-results/screens for visual review. */
export async function screenshot(page: Page, name: string, project: string): Promise<void> {
  // Let PrimeNG transitions (selected states, dialogs) settle first.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/screens/${name}-${project}.png`, fullPage: true });
}

/** Fails if the page scrolls horizontally. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal page overflow (px)').toBeLessThanOrEqual(0);
}
