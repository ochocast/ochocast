import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

const keycloakUrl =
  process.env.PLAYWRIGHT_KEYCLOAK_URL || 'http://localhost:8080';
const testUser = process.env.PLAYWRIGHT_TEST_USER || 'test-user';
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD || 'test-password';

setup('authenticate', async ({ page, baseURL }) => {
  await page.goto('/');

  // The app redirects unauthenticated users to the Keycloak login page.
  await page.waitForURL(`${keycloakUrl}/**`);

  await page.locator('#username').fill(testUser);
  await page.locator('#password').fill(testPassword);
  await page.locator('#kc-login').click();

  // Back on the app once the OIDC flow is done.
  await page.waitForURL(`${baseURL}/**`);
  await expect(page.getByRole('img', { name: 'OchoCast logo' })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
