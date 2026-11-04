import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('login', () => {
  test('signed-out visitors only see the login page', async ({ page }) => {
    for (const path of ['/', '/overview', '/settings', '/cards']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole('heading', { name: 'Portfolio Tracker' })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|register/i })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('fits a 360px screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');
    await expectNoHorizontalScroll(page);
  });

  test('validates the email address', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  test('does not reveal whether an email is registered', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Check your email.')).toBeVisible();
  });
});
