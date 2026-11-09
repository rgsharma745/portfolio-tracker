import {
  expect,
  test,
  HOLDINGS_EMAIL,
  ensureUser,
  expectNoHorizontalScroll,
  pickDate,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

/** Local `YYYY-MM-DD`, `offset` days from today (negative is in the past). */
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n, i) => String(n).padStart(i ? 2 : 4, '0'))
    .join('-');
};

test('Fixed deposits: maturity amount, days left, matured FDs, edit and delete', async ({
  page,
}, testInfo) => {
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no FDs

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/fd');
  await expect(page.getByRole('heading', { level: 1, name: 'Fixed deposits' })).toBeVisible();

  // First FD, from the empty state: ₹1,00,000 at 7% quarterly for 365 days, 100 days in
  await page.getByRole('button', { name: 'Add FD' }).click();
  const add = page.getByRole('dialog', { name: 'Add FD' });
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add.getByText('Enter the bank, e.g. SBI.')).toBeVisible();
  await expect(add.getByText('Pick the maturity date.')).toBeVisible();
  await expect(add.getByText('Enter the principal.')).toBeVisible();
  await expect(add.getByText('Enter the interest rate.')).toBeVisible();
  await add.getByLabel('Bank name').fill('E2E Bank');
  await pickDate(page, add.getByLabel('Date of investment'), day(-100));
  await pickDate(page, add.getByLabel('Maturity date'), day(265));
  await add.getByLabel('Principal (₹)').fill('1,00,000');
  await add.getByLabel('Interest rate (% a year)').fill('7');
  await expect(add.getByText('Term: 1 year (365 days).')).toBeVisible();
  await expect(add.getByText(/Matures with ₹1,07,186/)).toBeVisible();
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  const first = page.getByTestId('fd-E2E Bank');
  await expect(first).toContainText('₹1,07,186');
  await expect(first).toContainText('+₹7,186 interest');
  await expect(first).toContainText('265 days left');
  await expect(first).toContainText('About 9 months');
  await expect(first.getByRole('definition').filter({ hasText: '7%' })).toContainText('quarterly');
  await expect(first.getByRole('progressbar', { name: 'Term of E2E Bank' })).toHaveAttribute(
    'aria-valuenow',
    '27',
  );
  await expect(statCard(page, 'Next maturity')).toContainText('E2E Bank · 265 days left');

  // A second FD that has already matured: it moves to Matured and a note says so
  await page.getByRole('button', { name: 'Add FD' }).click();
  await add.getByLabel('Bank name').fill('E2E Old Bank');
  await pickDate(page, add.getByLabel('Date of investment'), day(-400));
  await pickDate(page, add.getByLabel('Maturity date'), day(-500));
  await add.getByLabel('Principal (₹)').fill('50000');
  await add.getByLabel('Interest rate (% a year)').fill('6.5');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add.getByText('Must be after the date of investment.')).toBeVisible();
  await pickDate(page, add.getByLabel('Maturity date'), day(-35));
  await add.getByRole('combobox', { name: 'Interest', exact: true }).click();
  await page.getByRole('option', { name: 'Yearly', exact: true }).click();
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  const matured = page.getByRole('region', { name: 'Matured' });
  const old = matured.getByTestId('fd-E2E Old Bank');
  await expect(old).toContainText('Matured');
  await expect(old).toContainText('₹53,250');
  await expect(page.getByText('1 FD has matured')).toBeVisible();
  // Principal 1,50,000 on two FDs (compact on phones)
  await expect(statCard(page, 'Principal')).toContainText('2 deposits');

  await expectNoHorizontalScroll(page);
  await screenshot(page, 'fd', testInfo.project.name);

  // Edit the first FD's rate: the maturity amount follows
  await page.getByRole('button', { name: 'Edit E2E Bank' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit FD' });
  await expect(edit.getByLabel('Interest rate (% a year)')).toHaveValue('7');
  await edit.getByLabel('Interest rate (% a year)').fill('7.5');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(first).toContainText('₹1,07,714');

  // Delete the matured one: the Matured section and its note go away
  await page.getByRole('button', { name: 'Edit E2E Old Bank' }).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(matured).toBeHidden();
  await expect(page.getByText('1 FD has matured')).toBeHidden();
  await expect(statCard(page, 'Principal')).toContainText('1 deposit');
});
