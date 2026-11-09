import {
  expect,
  test,
  HOLDINGS_EMAIL,
  adminInsert,
  ensureUser,
  expectNoHorizontalScroll,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
  isMobile,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('savings: total, shares, edit a balance, add and delete', async ({ page }, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me', 'Wife']);
  await adminInsert('savings_accounts', [
    { owner_id: ownerId, portfolio_id: ids['Me'], bank: 'E2E Bank A', balance: 300000 },
    { owner_id: ownerId, portfolio_id: ids['Wife'], bank: 'E2E Bank B', balance: 100000 },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/savings');
  const accounts = page.getByRole('list', { name: 'Savings accounts' });
  await expect(statCard(page, 'Total savings')).toContainText(mobile ? '₹4L' : '₹4,00,000');
  await expect(statCard(page, 'Largest account')).toContainText('E2E Bank A');
  await expect(accounts.getByRole('listitem').first()).toContainText('75% of total');
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'savings', testInfo.project.name);

  // Edit a balance: inline on desktop, dialog on mobile
  await page.getByRole('button', { name: /Balance of E2E Bank B/ }).click();
  if (mobile) {
    const dialog = page.getByRole('dialog', { name: 'Edit account' });
    await dialog.getByLabel('Balance (₹)').fill('5,00,000');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  } else {
    await page.getByLabel('New balance for E2E Bank B').fill('abc');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a number, e.g. 125000.50.')).toBeVisible();
    await page.getByLabel('New balance for E2E Bank B').fill('5,00,000');
    await page.getByRole('button', { name: 'Save' }).click();
  }
  // Re-sorted by balance: B is now the largest
  await expect(accounts.getByRole('listitem').first()).toContainText('E2E Bank B');
  await expect(statCard(page, 'Total savings')).toContainText(mobile ? '₹8L' : '₹8,00,000');

  // Add, then delete
  await page.getByRole('button', { name: 'Add account' }).click();
  const add = page.getByRole('dialog', { name: 'Add account' });
  await add.getByLabel('Bank or account').fill('E2E Bank C');
  await add.getByLabel('Balance (₹)').fill('1000');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();
  await expect(accounts).toContainText('E2E Bank C');
  await page.getByRole('button', { name: 'Edit E2E Bank C' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit account' });
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(accounts).not.toContainText('E2E Bank C');
});
