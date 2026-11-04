import { test as setup } from '@playwright/test';
import {
  OWNER_EMAIL,
  PORTFOLIOS,
  SETTINGS_EMAIL,
  SIGNOUT_EMAIL,
  WELCOME_EMAIL,
  ensureUser,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

export const OWNER_STATE = 'playwright/.auth/owner.json';

setup('sign in the e2e owner', async ({ page }) => {
  const ownerId = await ensureUser(OWNER_EMAIL);
  await seedPortfolios(ownerId, PORTFOLIOS);
  await Promise.all([SIGNOUT_EMAIL, WELCOME_EMAIL, SETTINGS_EMAIL].map(ensureUser));

  await signInWithMagicLink(page, OWNER_EMAIL);
  await page.context().storageState({ path: OWNER_STATE });
});
