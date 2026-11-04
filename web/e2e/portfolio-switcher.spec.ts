import { expect, test } from '@playwright/test';

test.describe('portfolio switcher', () => {
  test('defaults to All and remembers the choice across reloads', async ({ page }, testInfo) => {
    await page.goto('/overview');

    if (testInfo.project.name === 'mobile') {
      const chips = page.getByRole('group', { name: 'Portfolio' });
      await expect(chips.getByRole('button')).toHaveText(['All', 'Me', 'Wife']);
      await chips.getByRole('button', { name: 'All' }).click();
      await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await chips.getByRole('button', { name: 'Wife' }).click();
      await expect(chips.getByRole('button', { name: 'Wife' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.reload();
      await expect(chips.getByRole('button', { name: 'Wife' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await chips.getByRole('button', { name: 'All' }).click();
      await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } else {
      const select = page.getByRole('combobox', { name: 'Portfolio' });
      await select.click();
      await page.getByRole('option', { name: 'All' }).click();
      await expect(select).toHaveText('All');

      await select.click();
      await page.getByRole('option', { name: 'Me' }).click();
      await expect(select).toHaveText('Me');
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Portfolio' })).toHaveText('Me');

      await page.getByRole('combobox', { name: 'Portfolio' }).click();
      await page.getByRole('option', { name: 'All' }).click();
      await expect(page.getByRole('combobox', { name: 'Portfolio' })).toHaveText('All');
    }
  });
});
