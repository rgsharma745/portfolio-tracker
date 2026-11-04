import { test as setup } from '@playwright/test';
import {
  OWNER_EMAIL,
  PORTFOLIOS,
  SIGNOUT_EMAIL,
  ensureUser,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

export const OWNER_STATE = 'playwright/.auth/owner.json';

setup('sign in the e2e owner', async ({ page }) => {
  const ownerId = await ensureUser(OWNER_EMAIL);
  await seedPortfolios(ownerId, PORTFOLIOS);
  await ensureUser(SIGNOUT_EMAIL);

  await signInWithMagicLink(page, OWNER_EMAIL);
  await page.context().storageState({ path: OWNER_STATE });
});
