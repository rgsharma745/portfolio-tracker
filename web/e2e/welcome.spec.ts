import {
  expect,
  test,
  WELCOME_EMAIL,
  ensureUser,
  expectNoHorizontalScroll,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('a new owner creates their first portfolio from the welcome screen', async ({ page }) => {
  await seedPortfolios(await ensureUser(WELCOME_EMAIL), []);
  await signInWithMagicLink(page, WELCOME_EMAIL);

  const heading = page.getByRole('heading', { name: 'Create your first portfolio' });
  await expect(heading).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The welcome screen stays put on every page until a portfolio exists.
  await page.goto('/stocks');
  await expect(heading).toBeVisible();

  const name = page.getByLabel('Portfolio name');
  await expect(name).toHaveValue('Me');
  await name.fill('   ');
  await page.getByRole('button', { name: 'Create portfolio' }).click();
  await expect(page.getByText('Enter a name.')).toBeVisible();

  await name.fill('Rahul');
  await page.getByRole('button', { name: 'Create portfolio' }).click();
  await expect(heading).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Stocks' })).toBeVisible();
});
