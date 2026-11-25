import {
  adminInsert,
  animationsDone,
  ensureUser,
  expect,
  expectNoHorizontalScroll,
  HOLDINGS_EMAIL,
  pickDate,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
  test,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('employee equity records vesting, exercise and a multi-lot cashless sale', async ({
  page,
}, info) => {
  const owner = await ensureUser(HOLDINGS_EMAIL);
  const portfolios = await seedPortfolios(owner, ['Me']);
  const row = { owner_id: owner, portfolio_id: portfolios['Me'] };
  const [{ id: company }] = await adminInsert('equity_securities', [
    {
      owner_id: owner,
      name: 'Example Devices',
      market: 'PRIVATE',
      currency: 'INR',
      private_price: 100,
      private_price_date: '2026-01-01',
    },
  ]);
  const grants = await adminInsert('equity_grants', [
    {
      ...row,
      security_id: company,
      kind: 'RSU',
      label: 'Annual award',
      granted_on: '2024-01-01',
      quantity: 12,
      grant_price: null,
    },
    {
      ...row,
      security_id: company,
      kind: 'ESOP',
      label: 'Options plan',
      granted_on: '2024-01-01',
      quantity: 10,
      grant_price: 25,
    },
  ]);
  const award = grants.find((grant) => grant['label'] === 'Annual award')!['id'];
  const options = grants.find((grant) => grant['label'] === 'Options plan')!['id'];
  await adminInsert('equity_events', [
    { ...row, grant_id: options, kind: 'vest', occurred_on: '2025-01-01', quantity: 10 },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/rsu');
  await expect(page).toHaveURL(/employee-equity$/);
  await expect(page.getByRole('heading', { name: 'Employee equity', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Vesting', exact: true }).click();
  await page.getByRole('button', { name: 'Record vesting' }).click();
  const vest = page.getByRole('dialog', { name: 'Add vesting' });
  await vest.getByLabel('Grant', { exact: false }).selectOption(award);
  await expect(vest.getByLabel('FMV per share')).toBeVisible();
  await animationsDone(page);
  const controls = await vest.locator('select, input').evaluateAll((elements) =>
    elements.map((element) => {
      const { y, height } = element.getBoundingClientRect();
      return { id: element.id, y, height };
    }),
  );
  const heights = controls.map((control) => control.height);
  expect(
    Math.max(...heights) - Math.min(...heights),
    controls.map(({ id, height }) => `${id} is ${height}px`).join(', '),
  ).toBeLessThan(1);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  if (info.project.name === 'desktop') {
    for (let i = 0; i + 1 < controls.length; i += 2) {
      expect(controls[i].y, `Top of controls in row ${i / 2 + 1}`).toBeCloseTo(controls[i + 1].y);
    }
  }
  await vest.getByLabel('Vested quantity').fill('10');
  await vest.getByLabel('FMV per share').fill('40');
  const withheld = vest.getByLabel('Shares withheld or sold for tax');
  const saveVesting = vest.getByRole('button', { name: 'Save' });
  await withheld.fill('11');
  await saveVesting.click();
  await expect(withheld).toHaveAccessibleDescription(
    'Shares withheld for tax cannot exceed the quantity before tax.',
  );
  await expect(withheld).toBeFocused();

  await withheld.fill('2');
  const allotment = vest.getByLabel('Allotment date');
  await pickDate(page, allotment, '2025-01-01');
  await saveVesting.click();
  await expect(allotment).toHaveAccessibleDescription(
    'Allotment date must be on or after the vesting date.',
  );

  await allotment.click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await saveVesting.click();
  await expect(vest).toBeHidden();
  await expect(statCard(page, 'Current value')).toContainText('₹800');

  await page.getByRole('button', { name: 'Exercises', exact: true }).click();
  await page.getByRole('button', { name: 'Record exercise' }).click();
  const exercise = page.getByRole('dialog', { name: 'Add exercise' });
  await exercise.getByLabel('Grant', { exact: false }).selectOption(options);
  await exercise.getByLabel('Exercised quantity').fill('5');
  await expect(exercise.getByLabel('Exercise price per share')).toHaveValue('25');
  await exercise.getByLabel('FMV per share').fill('50');
  await exercise.getByLabel('Allotment date', { exact: false }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await exercise.getByRole('button', { name: 'Save' }).click();
  await expect(exercise).toBeHidden();
  await expect(statCard(page, 'Current value')).toContainText('₹1,300');

  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Record sale' }).click();
  const sale = page.getByRole('dialog', { name: 'Add sale' });
  await sale.getByLabel('Company').selectOption(company);
  await sale.getByLabel('Selling price per share').fill('200');
  await sale.getByLabel('Brokerage').fill('10');
  const first = sale.getByRole('group', { name: 'Lot 1' });
  await first.getByLabel('Acquisition lot').selectOption({
    label: (await first.getByRole('option', { name: /Annual award/ }).textContent())!.trim(),
  });
  await first.getByLabel('Quantity sold').fill('9');
  await sale.getByRole('button', { name: 'Save' }).click();
  await expect(
    sale.getByText('The change conflicts with shares already sold from a lot.'),
  ).toBeVisible();
  await first.getByLabel('Quantity sold').fill('2');
  await sale.getByRole('button', { name: 'Add lot', exact: true }).click();
  const second = sale.getByRole('group', { name: 'Lot 2' });
  await second.getByLabel('Acquisition lot').selectOption({
    label: (await second.getByRole('option', { name: /Options plan/ }).textContent())!.trim(),
  });
  await second.getByLabel('Quantity sold').fill('3');
  await second.getByLabel('Exercise cost deducted').fill('125');
  await second.getByLabel('Tax deducted from payout').fill('50');
  await sale.getByLabel('INR credited to bank').fill('815');
  await sale.getByLabel('Bank credit date').click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await sale.getByRole('button', { name: 'Save' }).click();
  await expect(sale).toBeHidden();
  await expect(statCard(page, 'Current value')).toContainText('₹800');
  await expect(statCard(page, 'INR received in bank')).toContainText('₹815');
  await expect(statCard(page, 'Realized P&L')).toContainText('₹760');
  await expectNoHorizontalScroll(page);
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 360, height: 844 });
    await expectNoHorizontalScroll(page);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'employee-equity', info.project.name);
});
