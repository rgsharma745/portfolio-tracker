import {
  expect,
  test,
  SIGNOUT_EMAIL,
  ensureUser,
  signInWithMagicLink,
  isMobile,
} from './support/fixtures';

// Uses its own user: signing out revokes that user's sessions, which would break the
// owner session the other specs in this worker use.
test.use({ storageState: { cookies: [], origins: [] } });

test('signing out returns to the login page and locks the app', async ({ page }, testInfo) => {
  await ensureUser(SIGNOUT_EMAIL);
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
