import { expect, test } from '@playwright/test';
import { SIGNOUT_EMAIL, signInWithMagicLink, isMobile } from './support/fixtures';

// Uses its own user: signing out revokes that user's sessions, which would break the
// shared owner session used by the other specs.
test.use({ storageState: { cookies: [], origins: [] } });

test('signing out returns to the login page and locks the app', async ({ page }, testInfo) => {
  await signInWithMagicLink(page, SIGNOUT_EMAIL);

  if (isMobile(testInfo)) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  } else {
    await page.locator('nav.sidebar').getByRole('button', { name: 'Sign out' }).click();
  }

  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login$/);
});
