import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

const keycloakUrl =
  process.env.PLAYWRIGHT_KEYCLOAK_URL || 'http://localhost:8080';
const apiUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001/api';
const testUser = process.env.PLAYWRIGHT_TEST_USER || 'test-user';
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD || 'test-password';

setup('authenticate', async ({ page, baseURL }) => {
  await page.goto('/');

  // The app redirects unauthenticated users to the Keycloak login page.
  await page.waitForURL(`${keycloakUrl}/**`);

  await page.locator('#username').fill(testUser);
  await page.locator('#password').fill(testPassword);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/users/login` &&
      response.request().method() === 'GET',
  );
  await page.locator('#kc-login').click();

  // Back on the app once the OIDC flow is done.
  await page.waitForURL(`${baseURL}/**`);
  await expect(page.getByRole('img', { name: 'OchoCast logo' })).toBeVisible();
  expect(
    (await loginResponse).status(),
    'The backend must accept the Keycloak session before saving it',
  ).toBe(200);

  await page.context().storageState({ path: authFile });
});
